// What a coach's platform subscription lets them do, enforced in the database:
//   * 20261017000002: a lapsed subscription (canceled, or no row) blocks the
//     coach's writes and new clients, but not reads, deletes or asking to
//     reactivate -- and never the client's side.
//   * 20261018000001: forms_builder / custom_library / white_label gate
//     creating new things; what already exists stays usable.
import { type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";

type User = { userId: string; client: SupabaseClient<Database> };

const coachMeta = (tag: string) => ({ role: "coach", full_name: `Coach ${tag}`, business_name: `${tag} Gym`, locale: "ar" });

async function setSubscription(coachId: string, patch: { status?: string; tierKey?: string }) {
  const update: { status?: string; tier_id?: string } = {};
  if (patch.status) update.status = patch.status;
  if (patch.tierKey) {
    const { data } = await admin.from("subscription_tiers").select("id").eq("key", patch.tierKey).single();
    update.tier_id = data!.id;
  }
  const { error } = await admin.from("subscriptions").update(update).eq("coach_id", coachId);
  if (error) throw error;
}

describe("lapsed subscription", () => {
  let coach: User;
  let clientId: string;
  let programId: string;
  const program = (coachId: string, name: string) => ({ coach_id: coachId, name_ar: name, name_en: name });

  beforeAll(async () => {
    coach = await createRlsUser("access-lapsed", coachMeta("Lapsed"));
    // Set up while the trial is still running.
    const client = await coach.client
      .from("clients")
      .insert({ coach_id: coach.userId, display_name: "Before" })
      .select("id")
      .single();
    if (client.error) throw client.error;
    clientId = client.data.id;
    const created = await coach.client
      .from("programs")
      .insert(program(coach.userId, "Before"))
      .select("id")
      .single();
    if (created.error) throw created.error;
    programId = created.data.id;

    await setSubscription(coach.userId, { status: "canceled" });
  }, 30_000);

  it("still reads everything it owns", async () => {
    expect((await coach.client.from("clients").select("id")).data).toHaveLength(1);
    expect((await coach.client.from("programs").select("id")).data).toHaveLength(1);
    expect((await coach.client.from("subscriptions").select("status")).data).toEqual([{ status: "canceled" }]);
  });

  it("can't add a client, and is told why", async () => {
    const insert = await coach.client.from("clients").insert({ coach_id: coach.userId, display_name: "After" });
    expect(insert.error?.hint).toBe("subscription_inactive");
  });

  it("can't restore an archived client either", async () => {
    await admin.from("clients").update({ status: "archived" }).eq("id", clientId);
    const restore = await coach.client.from("clients").update({ status: "active" }).eq("id", clientId);
    expect(restore.error).not.toBeNull();
    const { data } = await admin.from("clients").select("status").eq("id", clientId).single();
    expect(data?.status).toBe("archived");
  });

  it("can't create or edit programs", async () => {
    const insert = await coach.client.from("programs").insert(program(coach.userId, "After"));
    expect(insert.error?.code).toBe("42501");

    const update = await coach.client.from("programs").update({ name_en: "Renamed" }).eq("id", programId);
    expect(update.error?.code).toBe("42501");
    const { data } = await admin.from("programs").select("name_en").eq("id", programId).single();
    expect(data?.name_en).toBe("Before");
  });

  it("can still ask to reactivate", async () => {
    const request = await coach.client
      .from("subscription_requests")
      .insert({ coach_id: coach.userId, type: "reactivate", note: "back please" });
    expect(request.error).toBeNull();
  });

  it("can still delete its own data", async () => {
    const del = await coach.client.from("programs").delete().eq("id", programId).select("id");
    expect(del.error).toBeNull();
    expect(del.data).toHaveLength(1);
  });

  it("treats a missing subscription row like a canceled one", async () => {
    const orphan = await createRlsUser("access-norow", coachMeta("NoRow"));
    await admin.from("subscriptions").delete().eq("coach_id", orphan.userId);

    const insert = await orphan.client.from("clients").insert({ coach_id: orphan.userId, display_name: "X" });
    expect(insert.error?.hint).toBe("subscription_inactive");
  });

  it("writes again once the subscription is active", async () => {
    await setSubscription(coach.userId, { status: "active" });
    const insert = await coach.client.from("programs").insert(program(coach.userId, "Back"));
    expect(insert.error).toBeNull();
  });

  it("keeps writing through the past_due grace period", async () => {
    await setSubscription(coach.userId, { status: "past_due" });
    const insert = await coach.client.from("programs").insert(program(coach.userId, "Grace"));
    expect(insert.error).toBeNull();
  });
});

describe("plan features", () => {
  let starter: User;
  let studio: User;
  const form = (coachId: string, name: string) => ({ coach_id: coachId, kind: "custom", name_ar: name, name_en: name });
  const exercise = (coachId: string, name: string) => ({ coach_id: coachId, name_ar: name, name_en: name });

  beforeAll(async () => {
    // createRlsUser puts coach fixtures on the top plan.
    [starter, studio] = await Promise.all([
      createRlsUser("feat-starter", coachMeta("Starter")),
      createRlsUser("feat-studio", coachMeta("Studio")),
    ]);
    // Content made while the coach still had the features, then a downgrade.
    const seeded = await Promise.all([
      starter.client.from("form_templates").insert(form(starter.userId, "Kept form")),
      starter.client.from("exercises").insert(exercise(starter.userId, "Kept exercise")),
      starter.client.from("coaches").update({ slug: `kept-${Date.now()}` }).eq("id", starter.userId),
    ]);
    for (const result of seeded) if (result.error) throw result.error;
    await setSubscription(starter.userId, { tierKey: "starter" });
  }, 30_000);

  it("forms_builder: existing forms stay editable, new ones are refused", async () => {
    const edit = await starter.client
      .from("form_templates")
      .update({ name_en: "Renamed form" })
      .eq("coach_id", starter.userId)
      .select("id");
    expect(edit.error).toBeNull();
    expect(edit.data).toHaveLength(1);

    const create = await starter.client.from("form_templates").insert(form(starter.userId, "Second form"));
    expect(create.error?.hint).toBe("upgrade_required");
  });

  it("forms_builder: the first form is free on any plan", async () => {
    const fresh = await createRlsUser("feat-fresh", coachMeta("Fresh"));
    await setSubscription(fresh.userId, { tierKey: "starter" });

    const first = await fresh.client.from("form_templates").insert(form(fresh.userId, "Starter form"));
    expect(first.error).toBeNull();
    const second = await fresh.client.from("form_templates").insert(form(fresh.userId, "One too many"));
    expect(second.error?.hint).toBe("upgrade_required");
  });

  it("custom_library: existing entries stay editable, new ones are refused", async () => {
    const edit = await starter.client
      .from("exercises")
      .update({ name_en: "Renamed exercise" })
      .eq("coach_id", starter.userId)
      .select("id");
    expect(edit.error).toBeNull();
    expect(edit.data).toHaveLength(1);

    const create = await starter.client.from("exercises").insert(exercise(starter.userId, "New exercise"));
    expect(create.error?.hint).toBe("upgrade_required");
    const food = await starter.client
      .from("foods")
      .insert({ coach_id: starter.userId, name_ar: "أكل", name_en: "Food", kcal: 100 });
    expect(food.error?.hint).toBe("upgrade_required");
  });

  it("white_label: the current logo and address stay, new ones are refused", async () => {
    const logo = await starter.client
      .from("coaches")
      .update({ logo_path: `${starter.userId}/logo.png` })
      .eq("id", starter.userId);
    expect(logo.error?.hint).toBe("upgrade_required");

    const slug = await starter.client
      .from("coaches")
      .update({ slug: `another-${Date.now()}` })
      .eq("id", starter.userId);
    expect(slug.error?.hint).toBe("upgrade_required");

    // Saving other settings alongside the unchanged address is not a change.
    const { data: current } = await admin.from("coaches").select("slug").eq("id", starter.userId).single();
    const unchanged = await starter.client
      .from("coaches")
      .update({ slug: current!.slug, business_name: "Still Starter" })
      .eq("id", starter.userId);
    expect(unchanged.error).toBeNull();

    // Going back to the generated address is always allowed.
    const reset = await starter.client
      .from("coaches")
      .update({ slug: `coach-${starter.userId.replaceAll("-", "")}` })
      .eq("id", starter.userId);
    expect(reset.error).toBeNull();
  });

  it("a plan with the features can do all of it", async () => {
    const results = await Promise.all([
      studio.client.from("form_templates").insert(form(studio.userId, "One")),
      studio.client.from("exercises").insert(exercise(studio.userId, "Custom")),
      studio.client.from("coaches").update({ logo_path: `${studio.userId}/logo.png` }).eq("id", studio.userId),
    ]);
    for (const result of results) expect(result.error).toBeNull();
    const second = await studio.client.from("form_templates").insert(form(studio.userId, "Two"));
    expect(second.error).toBeNull();
  });

  it("get_my_features reports the caller's plan", async () => {
    // ponytail: not in the generated types until the migration is applied.
    const mine = await starter.client.rpc("get_my_features" as never);
    expect((mine.data as unknown as Record<string, boolean>).forms_builder).not.toBe(true);
    const theirs = await studio.client.rpc("get_my_features" as never);
    expect((theirs.data as unknown as Record<string, boolean>).forms_builder).toBe(true);
  });
});

describe("subscription notices", () => {
  it("queues a notice once per period, and only for the service role", async () => {
    const coach = await createRlsUser("notice-coach", coachMeta("Notice"));
    const { data: sub } = await admin.from("subscriptions").select("id").eq("coach_id", coach.userId).single();
    const args = { p_subscription_id: sub!.id, p_kind: "past_due", p_period_end: "2026-08-01T00:00:00Z" };

    // ponytail: not in the generated types until the migration is applied.
    const asCoach = await coach.client.rpc("queue_subscription_notice" as never, args as never);
    expect(asCoach.error).not.toBeNull();

    expect((await admin.rpc("queue_subscription_notice" as never, args as never)).data).toBe(true);
    expect((await admin.rpc("queue_subscription_notice" as never, args as never)).data).toBe(false);

    const { data: notices } = await admin
      .from("notifications")
      .select("kind")
      .eq("profile_id", coach.userId)
      .eq("kind", "subscription_past_due");
    expect(notices).toHaveLength(1);

    // A new period makes the same kind due again.
    const next = { ...args, p_period_end: "2026-09-01T00:00:00Z" };
    expect((await admin.rpc("queue_subscription_notice" as never, next as never)).data).toBe(true);
  });

  it("emails a subscription notice even with email notifications turned off", async () => {
    const coach = await createRlsUser("notice-optout", coachMeta("OptOut"));
    await admin.from("profiles").update({ email_notifications: false }).eq("id", coach.userId);
    const { data: sub } = await admin.from("subscriptions").select("id").eq("coach_id", coach.userId).single();

    await admin.rpc(
      "queue_subscription_notice" as never,
      { p_subscription_id: sub!.id, p_kind: "canceled", p_period_end: "2026-08-01T00:00:00Z" } as never
    );

    const { data } = await admin
      .from("notification_deliveries")
      .select("channel, notifications!inner(profile_id)")
      .eq("notifications.profile_id", coach.userId)
      .eq("channel", "email");
    expect(data).toHaveLength(1);
  });
});
