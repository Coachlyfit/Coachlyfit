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

  it("does NOT let an admin read client-owned tables directly (checkins, body_metrics)", async () => {
    const checkins = await adminUser.client.from("checkins").select("id");
    expect(checkins.data).toEqual([]);

    const metrics = await adminUser.client.from("body_metrics").select("id");
    expect(metrics.data).toEqual([]);
  });
});
