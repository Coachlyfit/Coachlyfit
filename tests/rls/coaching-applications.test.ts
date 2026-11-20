// Coaching applications (20261127000001): anon can only go through the RPC,
// coaches see/triage only their own rows, applicant content is frozen.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";

type User = { userId: string; client: SupabaseClient<Database> };

const anon = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let coach: User;
let other: User;
let domain: string;
let unpublishedDomain: string;

const valid = (key: string, email = `a-${Date.now()}@example.com`) => ({
  p_key: key,
  p_name: "Sara",
  p_email: email,
  p_phone: "+201001234567",
  p_goal: "lose_fat",
  p_activity_level: "light",
});

beforeAll(async () => {
  [coach, other] = await Promise.all([
    createRlsUser("apply-coach", { role: "coach", full_name: "Coach A", business_name: "A Gym", locale: "ar" }),
    createRlsUser("apply-other", { role: "coach", full_name: "Coach B", business_name: "B Gym", locale: "ar" }),
  ]);
  domain = `apply-${Date.now()}.example.com`;
  unpublishedDomain = `apply-draft-${Date.now()}.example.com`;
  const a = await admin.from("coach_sites").insert({
    coach_id: coach.userId,
    domain,
    is_published: true,
    published_content: { hero: { title: "Hi" } },
    published_at: new Date().toISOString(),
  });
  if (a.error) throw a.error;
  const b = await admin.from("coach_sites").insert({ coach_id: other.userId, domain: unpublishedDomain, is_published: false });
  if (b.error) throw b.error;
});

describe("coaching_applications", () => {
  it("anon cannot touch the table directly", async () => {
    const ins = await anon.from("coaching_applications").insert({
      coach_id: coach.userId,
      name: "x",
      email: "x@example.com",
      phone: "12345",
      goal: "other",
      activity_level: "light",
    });
    expect(ins.error).not.toBeNull();
    const sel = await anon.from("coaching_applications").select("id");
    expect(sel.error).not.toBeNull();
  });

  it("RPC stores an application for a published site, lowercased email", async () => {
    const { data, error } = await anon.rpc("submit_coaching_application", valid(domain, `Up-${Date.now()}@Example.com`));
    expect(error).toBeNull();
    const out = data as { ok: boolean; id: string; coach_id: string };
    expect(out.ok).toBe(true);
    expect(out.coach_id).toBe(coach.userId);
    const row = await admin.from("coaching_applications").select("email,status").eq("id", out.id).single();
    expect(row.data?.status).toBe("new");
    expect(row.data?.email).toMatch(/^up-.*@example\.com$/);
  });

  it("RPC rejects unpublished site, bad input", async () => {
    const draft = await anon.rpc("submit_coaching_application", valid(unpublishedDomain));
    expect((draft.data as { error: string }).error).toBe("not_found");
    const bad = await anon.rpc("submit_coaching_application", { ...valid(domain), p_goal: "nope" });
    expect((bad.data as { error: string }).error).toBe("invalid_input");
  });

  it("RPC rate limits repeat submissions from one email", async () => {
    const email = `spam-${Date.now()}@example.com`;
    const results: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { data } = await anon.rpc("submit_coaching_application", valid(domain, email));
      results.push((data as { ok: boolean; error?: string }).ok ? "ok" : (data as { error: string }).error);
    }
    expect(results).toContain("rate_limited");
  });

  it("coach reads/triages own rows only; applicant content is frozen", async () => {
    const { data } = await anon.rpc("submit_coaching_application", valid(domain));
    const id = (data as { id: string }).id;

    const mine = await coach.client.from("coaching_applications").select("id").eq("id", id);
    expect(mine.data).toHaveLength(1);
    const theirs = await other.client.from("coaching_applications").select("id").eq("id", id);
    expect(theirs.data).toHaveLength(0);

    const ok = await coach.client.from("coaching_applications").update({ status: "reviewing", coach_notes: "call" }).eq("id", id);
    expect(ok.error).toBeNull();
    const edit = await coach.client.from("coaching_applications").update({ name: "Hacked" }).eq("id", id);
    expect(edit.error).not.toBeNull();
    const cross = await other.client.from("coaching_applications").update({ status: "rejected" }).eq("id", id).select("id");
    expect(cross.data ?? []).toHaveLength(0);
  });
});
