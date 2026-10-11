// Admin is the one role allowed to see across tenants — but only through
// the narrow admin_metrics()/admin_list_coaches()/record_payment() RPCs.
// This proves both halves: those RPCs actually work for an admin, AND a
// non-admin gets rejected, AND admin still can't read client-owned tables
// directly (see build plan: "confirm an admin session cannot select from
// checkins or body_metrics").
import { type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";

async function createUser(tag: string, role: "coach" | "admin") {
  const meta =
    role === "coach"
      ? { role, full_name: `Coach ${tag}`, business_name: `${tag} Gym`, locale: "ar" }
      : { role, full_name: `Admin ${tag}`, locale: "ar" };
  return createRlsUser(`admin-test-${tag}`, meta);
}

let coach: { userId: string; client: SupabaseClient<Database> };
let adminUser: { userId: string; client: SupabaseClient<Database> };

beforeAll(async () => {
  [coach, adminUser] = await Promise.all([createUser("coach", "coach"), createUser("admin", "admin")]);
}, 30_000);

describe("admin RPC surface", () => {
  it("rejects a non-admin calling record_payment", async () => {
    const { data: sub } = await admin.from("subscriptions").select("id").eq("coach_id", coach.userId).single();
    const result = await coach.client.rpc("record_payment", {
      p_coach_id: coach.userId,
      p_amount_egp: 450,
      p_method: "instapay",
      p_period_start: "2026-08-01",
      p_period_end: "2026-09-01",
    });
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe("42501");
    expect(sub).toBeTruthy(); // sanity: the subscription did exist
  });

  it("lets an admin record a payment and extends the coach's period", async () => {
    const result = await adminUser.client.rpc("record_payment", {
      p_coach_id: coach.userId,
      p_amount_egp: 450,
      p_method: "instapay",
      p_reference: "TEST-REF-1",
      p_period_start: "2026-08-01",
      p_period_end: "2026-09-01",
    });
    expect(result.error).toBeNull();

    const { data: sub } = await admin
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("coach_id", coach.userId)
      .single();
    expect(sub?.status).toBe("active");
    expect(sub?.current_period_end?.startsWith("2026-09-01")).toBe(true);
  });

  it("returns aggregate metrics and the coach in admin_list_coaches for an admin", async () => {
    const metrics = await adminUser.client.rpc("admin_metrics");
    expect(metrics.error).toBeNull();
    expect(metrics.data).toMatchObject({ mrr_egp: expect.any(Number) });

    const coaches = await adminUser.client.rpc("admin_list_coaches");
    expect(coaches.error).toBeNull();
    expect(coaches.data?.some((c) => c.coach_id === coach.userId)).toBe(true);
  });

  it("rejects a non-admin calling the admin-only RPCs", async () => {
    const metrics = await coach.client.rpc("admin_metrics");
    expect(metrics.error).not.toBeNull();

    const coaches = await coach.client.rpc("admin_list_coaches");
    expect(coaches.error).not.toBeNull();
  });

  it("returns the dashboard aggregates and per-coach columns the admin home reads", async () => {
    const metrics = await adminUser.client.rpc("admin_metrics");
    expect(metrics.data).toMatchObject({
      past_due_amount_egp: expect.any(Number),
      canceled_90d_count: expect.any(Number),
      churn_window_complete: expect.any(Boolean),
      plan_mix: expect.any(Array),
      mrr_history: expect.any(Array),
      online_count: expect.any(Number),
    });

    const coaches = await adminUser.client.rpc("admin_list_coaches");
    const row = coaches.data?.find((c) => c.coach_id === coach.userId);
    expect(row).toMatchObject({ owner_name: "Coach coach", price_egp_monthly: expect.any(Number) });
  });

  it("serves the Online now page to an admin: summary, one coach's clients, and an invite link for an account-less client", async () => {
    const { data: client } = await coach.client
      .from("clients")
      .insert({ coach_id: coach.userId, display_name: "Invited Only" })
      .select("id")
      .single();

    const summary = await adminUser.client.rpc("admin_online_summary");
    expect(summary.error).toBeNull();
    expect(summary.data).toMatchObject({
      coach_total: expect.any(Number),
      active_today: expect.any(Number),
      active_7d: expect.any(Number),
      never_count: expect.any(Number),
      coaches: expect.any(Array),
    });

    const clients = await adminUser.client.rpc("admin_coach_clients", { p_coach_id: coach.userId });
    expect(clients.error).toBeNull();
    expect(clients.data?.find((c) => c.client_id === client!.id)).toMatchObject({
      user_id: null,
      last_seen_at: null,
      can_invite: true,
    });

    const invite = await adminUser.client.rpc("admin_create_invite", {
      p_client_id: client!.id,
      p_token_hash: "a".repeat(64),
    });
    expect(invite.error).toBeNull();
    expect(typeof invite.data).toBe("string"); // the coach's slug

    const { data: logged } = await admin
      .from("admin_audit_log")
      .select("action")
      .eq("target_user_id", coach.userId)
      .eq("action", "invite_link_created");
    expect(logged).toHaveLength(1);
  });

  it("rejects a non-admin calling the Online now RPCs", async () => {
    const summary = await coach.client.rpc("admin_online_summary");
    expect(summary.error?.code).toBe("42501");

    const clients = await coach.client.rpc("admin_coach_clients", { p_coach_id: coach.userId });
    expect(clients.error?.code).toBe("42501");

    const invite = await coach.client.rpc("admin_create_invite", {
      p_client_id: coach.userId,
      p_token_hash: "a".repeat(64),
    });
    expect(invite.error?.code).toBe("42501");
  });

  it("stamps status_changed_at when a subscription's status changes", async () => {
    await admin.from("subscriptions").update({ status: "past_due" }).eq("coach_id", coach.userId);
    const { data: sub } = await admin
      .from("subscriptions")
      .select("status_changed_at")
      .eq("coach_id", coach.userId)
      .single();
    expect(sub?.status_changed_at).not.toBeNull();
  });

  it("keeps MRR snapshots admin-read-only and snapshot_mrr() cron-only", async () => {
    expect((await admin.rpc("snapshot_mrr")).error).toBeNull();

    const asAdmin = await adminUser.client.from("mrr_snapshots").select("month");
    expect(asAdmin.data?.length).toBeGreaterThan(0);

    const asCoach = await coach.client.from("mrr_snapshots").select("month");
    expect(asCoach.data).toEqual([]);

    expect((await coach.client.rpc("snapshot_mrr")).error).not.toBeNull();
    expect((await adminUser.client.rpc("snapshot_mrr")).error).not.toBeNull();
  });

  it("does NOT let an admin read client-owned tables directly (checkins, body_metrics)", async () => {
    const checkins = await adminUser.client.from("checkins").select("id");
    expect(checkins.data).toEqual([]);

    const metrics = await adminUser.client.from("body_metrics").select("id");
    expect(metrics.data).toEqual([]);
  });
});
