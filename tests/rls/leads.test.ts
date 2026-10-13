// Leads (20261022000001): admin-only tables. A coach, a client and an
// anonymous visitor can't read or write them; the one thing open to everyone
// is lead_unsubscribe(), by token, and unsubscribing can't be undone from the
// admin table.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";

type User = { userId: string; client: SupabaseClient<Database> };

let coach: User;
let adminUser: User;
let clientUser: User;
let leadId: string;
let token: string;

const anon = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const leadEmail = `Lead-${Date.now()}@Example.test`;

beforeAll(async () => {
  [coach, adminUser, clientUser] = await Promise.all([
    createRlsUser("leads-coach", { role: "coach", full_name: "Coach Leads", business_name: "Leads Gym", locale: "ar" }),
    createRlsUser("leads-admin", { role: "admin", full_name: "Admin Leads", locale: "ar" }),
    createRlsUser("leads-client", { role: "client", full_name: "Client Leads", locale: "ar" }),
  ]);

  const { data, error } = await adminUser.client
    .from("leads")
    .insert({ email: `  ${leadEmail} `, full_name: "RLS Lead" })
    .select("id, email, unsubscribe_token, created_by")
    .single();
  if (error) throw error;
  leadId = data.id;
  token = data.unsubscribe_token;
  expect(data.email).toBe(leadEmail.toLowerCase());
  expect(data.created_by).toBe(adminUser.userId);
}, 30_000);

afterAll(async () => {
  await admin.from("leads").delete().eq("id", leadId);
});

describe("leads: admin", () => {
  it("reads and updates leads and logs a send as themselves only", async () => {
    const update = await adminUser.client.from("leads").update({ status: "contacted" }).eq("id", leadId).select("status").single();
    expect(update.data?.status).toBe("contacted");

    const own = await adminUser.client
      .from("lead_email_sends")
      .insert({ lead_id: leadId, subject: "Hi", status: "sent", sent_by: adminUser.userId });
    expect(own.error).toBeNull();

    const other = await adminUser.client
      .from("lead_email_sends")
      .insert({ lead_id: leadId, subject: "Hi", status: "sent", sent_by: coach.userId });
    expect(other.error).not.toBeNull();
  });

  it("cannot add the same address twice, whatever its case", async () => {
    const result = await adminUser.client.from("leads").insert({ email: leadEmail.toUpperCase() });
    expect(result.error?.code).toBe("23505");
  });
});

describe("leads: everyone else", () => {
  it.each([
    ["coach", () => coach.client],
    ["client", () => clientUser.client],
    ["anonymous visitor", () => anon],
  ] as const)("gives a %s no access to the tables", async (_role, getClient) => {
    const client = getClient();

    const leads = await client.from("leads").select("id");
    expect(leads.data ?? []).toEqual([]);
    const sends = await client.from("lead_email_sends").select("id");
    expect(sends.data ?? []).toEqual([]);

    const insert = await client.from("leads").insert({ email: `intruder-${Date.now()}@example.test` });
    expect(insert.error).not.toBeNull();

    await client.from("leads").update({ status: "replied" }).eq("id", leadId);
    await client.from("leads").delete().eq("id", leadId);
    const { data } = await admin.from("leads").select("status").eq("id", leadId).single();
    expect(data?.status).toBe("contacted");
  });
});

describe("lead_unsubscribe", () => {
  it("says nothing useful about an unknown token", async () => {
    const result = await anon.rpc("lead_unsubscribe", { p_token: crypto.randomUUID(), p_confirm: true });
    expect(result.data).toBe("invalid");
  });

  it("only reads without p_confirm, then unsubscribes for good", async () => {
    const read = await anon.rpc("lead_unsubscribe", { p_token: token });
    expect(read.data).toBe("active");
    const before = await admin.from("leads").select("unsubscribed_at").eq("id", leadId).single();
    expect(before.data?.unsubscribed_at).toBeNull();

    const confirm = await anon.rpc("lead_unsubscribe", { p_token: token, p_confirm: true });
    expect(confirm.data).toBe("unsubscribed");
    const again = await anon.rpc("lead_unsubscribe", { p_token: token, p_confirm: true });
    expect(again.data).toBe("unsubscribed");

    // An admin changing the status afterwards does not resubscribe the lead.
    await adminUser.client.from("leads").update({ status: "new", unsubscribed_at: null }).eq("id", leadId);
    const after = await admin.from("leads").select("status, unsubscribed_at").eq("id", leadId).single();
    expect(after.data?.status).toBe("unsubscribed");
    expect(after.data?.unsubscribed_at).not.toBeNull();
  });
});
