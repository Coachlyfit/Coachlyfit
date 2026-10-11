// Subscription management (20261012000001): a coach reads only their own
// subscription, can file/withdraw their own request and flip
// cancel-at-period-end, and nothing else. Plan/status/dates move only through
// the admin RPCs, which also write the audit log. A client sees none of it.
import { type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";

type User = { userId: string; client: SupabaseClient<Database> };

let coachA: User;
let coachB: User;
let adminUser: User;
let clientUser: User;
let tiers: { id: string; key: string }[];

const coachMeta = (tag: string) => ({ role: "coach", full_name: `Coach ${tag}`, business_name: `${tag} Gym`, locale: "ar" });

beforeAll(async () => {
  [coachA, coachB, adminUser, clientUser] = await Promise.all([
    createRlsUser("sub-mgmt-a", coachMeta("A")),
    createRlsUser("sub-mgmt-b", coachMeta("B")),
    createRlsUser("sub-mgmt-admin", { role: "admin", full_name: "Admin Sub", locale: "ar" }),
    createRlsUser("sub-mgmt-client", { role: "client", full_name: "Client Sub", locale: "ar" }),
  ]);
  const { data } = await admin.from("subscription_tiers").select("id, key").order("price_egp_monthly");
  tiers = data ?? [];
}, 30_000);

const subOf = async (coachId: string) =>
  (await admin.from("subscriptions").select("*").eq("coach_id", coachId).single()).data!;

describe("subscription read isolation", () => {
  it("shows a coach only their own subscription", async () => {
    const { data } = await coachA.client.from("subscriptions").select("coach_id");
    expect(data).toEqual([{ coach_id: coachA.userId }]);

    const other = await coachA.client.from("subscriptions").select("id").eq("coach_id", coachB.userId);
    expect(other.data).toEqual([]);
  });

  it("gives a client no access to subscriptions or requests", async () => {
    expect((await clientUser.client.from("subscriptions").select("id")).data).toEqual([]);
    expect((await clientUser.client.from("subscription_requests").select("id")).data).toEqual([]);

    const insert = await clientUser.client
      .from("subscription_requests")
      .insert({ coach_id: coachA.userId, type: "other", note: "x" });
    expect(insert.error).not.toBeNull();
  });
});

describe("a coach cannot edit their own subscription", () => {
  it("rejects a direct update of status, plan or dates", async () => {
    const before = await subOf(coachA.userId);
    await coachA.client
      .from("subscriptions")
      .update({ status: "active", tier_id: tiers.at(-1)!.id, current_period_end: "2099-01-01T00:00:00Z" })
      .eq("coach_id", coachA.userId);

    const after = await subOf(coachA.userId);
    expect(after.status).toBe(before.status);
    expect(after.tier_id).toBe(before.tier_id);
    expect(after.current_period_end).toBe(before.current_period_end);
  });

  it("rejects the admin RPCs", async () => {
    const update = await coachA.client.rpc("admin_update_subscription", {
      p_coach_id: coachA.userId,
      p_status: "active",
    });
    expect(update.error?.code).toBe("42501");

    const note = await coachA.client.rpc("admin_add_coach_note", { p_coach_id: coachA.userId, p_note: "x" });
    expect(note.error?.code).toBe("42501");
  });

  it("lets the coach flip cancel-at-period-end, and only that", async () => {
    const before = await subOf(coachA.userId);
    expect((await coachA.client.rpc("set_my_subscription_cancel", { p_cancel: true })).error).toBeNull();

    const after = await subOf(coachA.userId);
    expect(after.cancel_at_period_end).toBe(true);
    expect(after.status).toBe(before.status);
    expect((await subOf(coachB.userId)).cancel_at_period_end).toBe(false);

    expect((await coachA.client.rpc("set_my_subscription_cancel", { p_cancel: false })).error).toBeNull();
    expect((await subOf(coachA.userId)).cancel_at_period_end).toBe(false);
  });

  it("gives a client nothing to cancel", async () => {
    const result = await clientUser.client.rpc("set_my_subscription_cancel", { p_cancel: true });
    expect(result.error?.code).toBe("P0002");
  });
});

describe("subscription requests", () => {
  it("lets a coach file one pending request for themself only", async () => {
    const forOther = await coachA.client
      .from("subscription_requests")
      .insert({ coach_id: coachB.userId, type: "other", note: "x" });
    expect(forOther.error).not.toBeNull();

    // Column-level insert grant: status/admin_response can't be supplied.
    const preApproved = await coachA.client
      .from("subscription_requests")
      .insert({ coach_id: coachA.userId, type: "other", note: "x", status: "approved" } as never);
    expect(preApproved.error).not.toBeNull();

    const ok = await coachA.client
      .from("subscription_requests")
      .insert({ coach_id: coachA.userId, type: "change_plan", tier_id: tiers.at(-1)!.id, note: "upgrade please" });
    expect(ok.error).toBeNull();

    const second = await coachA.client
      .from("subscription_requests")
      .insert({ coach_id: coachA.userId, type: "other", note: "another" });
    expect(second.error?.code).toBe("23505");
  });

  it("hides a coach's requests from another coach and blocks self-approval", async () => {
    expect((await coachB.client.from("subscription_requests").select("id")).data).toEqual([]);

    const { data: mine } = await coachA.client.from("subscription_requests").select("id");
    expect(mine).toHaveLength(1);

    await coachA.client.from("subscription_requests").update({ status: "approved" } as never).eq("id", mine![0].id);
    const { data: row } = await admin.from("subscription_requests").select("status").eq("id", mine![0].id).single();
    expect(row?.status).toBe("pending");

    const resolve = await coachA.client.rpc("admin_resolve_subscription_request", {
      p_request_id: mine![0].id,
      p_approve: true,
    });
    expect(resolve.error?.code).toBe("42501");
  });

  it("applies the plan change and logs it when an admin approves", async () => {
    const { data: pending } = await adminUser.client
      .from("subscription_requests")
      .select("id")
      .eq("coach_id", coachA.userId)
      .eq("status", "pending");
    expect(pending).toHaveLength(1);

    const result = await adminUser.client.rpc("admin_resolve_subscription_request", {
      p_request_id: pending![0].id,
      p_approve: true,
      p_response: "Done",
    });
    expect(result.error).toBeNull();
    expect((await subOf(coachA.userId)).tier_id).toBe(tiers.at(-1)!.id);

    const { data: resolved } = await coachA.client
      .from("subscription_requests")
      .select("status, admin_response")
      .eq("id", pending![0].id)
      .single();
    expect(resolved).toEqual({ status: "approved", admin_response: "Done" });

    const again = await adminUser.client.rpc("admin_resolve_subscription_request", {
      p_request_id: pending![0].id,
      p_approve: false,
    });
    expect(again.error?.code).toBe("22023");

    const { data: log } = await adminUser.client
      .from("admin_audit_log")
      .select("action, admin_id")
      .eq("target_user_id", coachA.userId)
      .eq("action", "request_approve");
    expect(log).toEqual([{ action: "request_approve", admin_id: adminUser.userId }]);
  });

  it("lets a coach withdraw only their own pending request", async () => {
    await coachB.client.from("subscription_requests").insert({ coach_id: coachB.userId, type: "reactivate" });
    const { data: theirs } = await admin.from("subscription_requests").select("id").eq("coach_id", coachB.userId);

    const byOther = await coachA.client.from("subscription_requests").delete().eq("id", theirs![0].id).select("id");
    expect(byOther.data).toEqual([]);

    const byOwner = await coachB.client.from("subscription_requests").delete().eq("id", theirs![0].id).select("id");
    expect(byOwner.data).toHaveLength(1);
  });
});

describe("admin subscription control", () => {
  it("changes plan, status and end date, and audits what changed", async () => {
    const result = await adminUser.client.rpc("admin_update_subscription", {
      p_coach_id: coachB.userId,
      p_tier_id: tiers[1].id,
      p_status: "active",
      p_period_end: "2099-01-01",
      p_cancel_at_period_end: true,
    });
    expect(result.error).toBeNull();

    const sub = await subOf(coachB.userId);
    expect(sub).toMatchObject({ tier_id: tiers[1].id, status: "active", cancel_at_period_end: true });
    expect(sub.current_period_end?.startsWith("2099-01-01")).toBe(true);

    const { data: log } = await adminUser.client
      .from("admin_audit_log")
      .select("details")
      .eq("target_user_id", coachB.userId)
      .eq("action", "subscription_update");
    expect(log?.[0].details).toMatchObject({
      tier: { to: tiers[1].key },
      status: { to: "active" },
      cancel_at_period_end: { from: false, to: true },
    });
  });

  it("clears a pending cancellation when a payment is recorded", async () => {
    const result = await adminUser.client.rpc("record_payment", {
      p_coach_id: coachB.userId,
      p_amount_egp: 500,
      p_method: "cash",
      p_period_start: "2099-01-01",
      p_period_end: "2099-02-01",
    });
    expect(result.error).toBeNull();
    expect((await subOf(coachB.userId)).cancel_at_period_end).toBe(false);
  });

  it("keeps internal notes out of the coach's reach", async () => {
    const add = await adminUser.client.rpc("admin_add_coach_note", { p_coach_id: coachB.userId, p_note: "called, will pay Friday" });
    expect(add.error).toBeNull();

    const asAdmin = await adminUser.client
      .from("admin_audit_log")
      .select("details")
      .eq("target_user_id", coachB.userId)
      .eq("action", "note");
    expect(asAdmin.data?.[0].details).toEqual({ note: "called, will pay Friday" });

    expect((await coachB.client.from("admin_audit_log").select("id")).data).toEqual([]);
  });

  it("returns the management columns from admin_list_coaches", async () => {
    const { data } = await adminUser.client.rpc("admin_list_coaches");
    const row = data?.find((c) => c.coach_id === coachB.userId);
    expect(row).toMatchObject({ tier_id: tiers[1].id, cancel_at_period_end: false, suspended_at: null });
  });
});
