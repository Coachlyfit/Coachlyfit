// Email campaigns (20261013000001): admin-only history tables and the
// recipients RPC. A coach or client can't read, write or resolve recipients;
// an admin can insert and read, and can change nothing on a sent campaign
// except its two counters.
import { type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";

type User = { userId: string; client: SupabaseClient<Database> };

let coach: User;
let adminUser: User;
let clientUser: User;
let campaignId: string;

const campaign = (sentBy: string) => ({
  subject: "RLS test",
  body: "Hello {{coach_name}}",
  direction: "rtl",
  recipient_filter: "all",
  recipient_count: 1,
  sent_by: sentBy,
});

beforeAll(async () => {
  [coach, adminUser, clientUser] = await Promise.all([
    createRlsUser("email-coach", { role: "coach", full_name: "Coach Email", business_name: "Email Gym", locale: "ar" }),
    createRlsUser("email-admin", { role: "admin", full_name: "Admin Email", locale: "ar" }),
    createRlsUser("email-client", { role: "client", full_name: "Client Email", locale: "ar" }),
  ]);

  const { data, error } = await adminUser.client.from("email_campaigns").insert(campaign(adminUser.userId)).select("id").single();
  if (error) throw error;
  campaignId = data.id;

  const recipients = await adminUser.client
    .from("email_campaign_recipients")
    .insert({ campaign_id: campaignId, coach_id: coach.userId, email: "coach@example.test", status: "sent" });
  if (recipients.error) throw recipients.error;
}, 30_000);

describe("email campaigns: admin", () => {
  it("reads campaigns and their recipients", async () => {
    const campaigns = await adminUser.client.from("email_campaigns").select("id").eq("id", campaignId);
    expect(campaigns.data).toEqual([{ id: campaignId }]);

    const recipients = await adminUser.client.from("email_campaign_recipients").select("coach_id").eq("campaign_id", campaignId);
    expect(recipients.data).toEqual([{ coach_id: coach.userId }]);
  });

  it("can update the counters and nothing else", async () => {
    const counts = await adminUser.client.from("email_campaigns").update({ sent_count: 1, failed_count: 0 }).eq("id", campaignId);
    expect(counts.error).toBeNull();

    const subject = await adminUser.client.from("email_campaigns").update({ subject: "changed" }).eq("id", campaignId);
    expect(subject.error).not.toBeNull();

    const { data } = await admin.from("email_campaigns").select("subject, sent_count").eq("id", campaignId).single();
    expect(data).toEqual({ subject: "RLS test", sent_count: 1 });
  });

  it("cannot insert a campaign attributed to someone else", async () => {
    const result = await adminUser.client.from("email_campaigns").insert(campaign(coach.userId));
    expect(result.error).not.toBeNull();
  });

  it("cannot delete a campaign", async () => {
    await adminUser.client.from("email_campaigns").delete().eq("id", campaignId);
    const { data } = await admin.from("email_campaigns").select("id").eq("id", campaignId);
    expect(data).toHaveLength(1);
  });

  // The suppression filter isn't exercised here: service_role has no delete
  // grant on email_suppressions, so a test row could not be cleaned up.
  it("resolves recipients with their email", async () => {
    const result = await adminUser.client.rpc("admin_email_recipients");
    expect(result.error).toBeNull();
    const row = result.data?.find((r) => r.coach_id === coach.userId);
    expect(row?.email).toMatch(/@example\.test$/);
    expect(row?.business_name).toBe("Email Gym");
  });
});

describe("email campaigns: coach and client", () => {
  it.each([
    ["coach", () => coach],
    ["client", () => clientUser],
  ] as const)("gives a %s no access", async (_role, getUser) => {
    const { client, userId } = getUser();

    // No grant on the tables: PostgREST rejects the select outright.
    const campaigns = await client.from("email_campaigns").select("id");
    expect(campaigns.data ?? []).toEqual([]);
    const recipients = await client.from("email_campaign_recipients").select("coach_id");
    expect(recipients.data ?? []).toEqual([]);

    const insert = await client.from("email_campaigns").insert(campaign(userId));
    expect(insert.error).not.toBeNull();
    const insertRecipient = await client
      .from("email_campaign_recipients")
      .insert({ campaign_id: campaignId, coach_id: userId, email: "x@example.test", status: "sent" });
    expect(insertRecipient.error).not.toBeNull();

    await client.from("email_campaigns").update({ sent_count: 99 }).eq("id", campaignId);
    const { data } = await admin.from("email_campaigns").select("sent_count").eq("id", campaignId).single();
    expect(data?.sent_count).not.toBe(99);

    const rpc = await client.rpc("admin_email_recipients");
    expect(rpc.error?.code).toBe("42501");
  });
});
