// The single most important test in this codebase: every coach-scoped
// table must return zero rows for a foreign tenant, and reject writes that
// try to cross the boundary. Runs against the local Supabase stack
// (`supabase start`) via the anon + service_role keys in .env.test.local.
//
// A coach-scoped table added without a case here is, per the build plan,
// treated as unfinished.
import { type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";

async function createCoach(tag: string) {
  return createRlsUser(`coach-${tag}`, {
    role: "coach",
    full_name: `Coach ${tag}`,
    business_name: `${tag} Fitness`,
    locale: "ar",
  });
}

/** Links an already-authenticated user as a client of `coachId`, bypassing
 * the invite flow (that's Phase 3's own test) so this suite can focus
 * purely on RLS. */
async function linkAsClient(coachId: string, profileId: string) {
  await admin.from("profiles").update({ role: "client" }).eq("id", profileId);
  const { data, error } = await admin
    .from("clients")
    .insert({ coach_id: coachId, profile_id: profileId, display_name: "Test Client" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

let coachA: { userId: string; client: SupabaseClient<Database> };
let coachB: { userId: string; client: SupabaseClient<Database> };

beforeAll(async () => {
  [coachA, coachB] = await Promise.all([createCoach("a"), createCoach("b")]);
}, 30_000);

describe("clients: tenant isolation", () => {
  it("a coach only sees their own client rows, never another coach's", async () => {
    const a = await coachA.client
      .from("clients")
      .insert({ coach_id: coachA.userId, display_name: "Alice" })
      .select("id")
      .single();
    expect(a.error).toBeNull();

    const seenByB = await coachB.client
      .from("clients")
      .select("id")
      .eq("id", a.data!.id);
    expect(seenByB.data).toEqual([]);
  });

  it("rejects inserting a client row into another coach's tenant", async () => {
    const res = await coachB.client
      .from("clients")
      .insert({ coach_id: coachA.userId, display_name: "Forged" });
    expect(res.error).not.toBeNull();
  });

  it("an update targeting a foreign coach's client row affects nothing", async () => {
    const mine = await coachA.client
      .from("clients")
      .insert({ coach_id: coachA.userId, display_name: "Untouched" })
      .select("id")
      .single();

    const update = await coachB.client
      .from("clients")
      .update({ display_name: "Hijacked" })
      .eq("id", mine.data!.id)
      .select("id");
    expect(update.data).toEqual([]);

    const stillMine = await coachA.client
      .from("clients")
      .select("display_name")
      .eq("id", mine.data!.id)
      .single();
    expect(stillMine.data?.display_name).toBe("Untouched");
  });
});

describe("exercises: global vs. per-coach library", () => {
  it("both coaches see global (admin-curated) exercises", async () => {
    const res = await coachA.client
      .from("exercises")
      .select("id")
      .is("coach_id", null);
    expect(res.data!.length).toBeGreaterThan(0);
  });

  it("a coach's custom exercise is invisible to another coach", async () => {
    const created = await coachA.client
      .from("exercises")
      .insert({ coach_id: coachA.userId, name_ar: "خاص", name_en: "Custom A" })
      .select("id")
      .single();
    expect(created.error).toBeNull();

    const seenByB = await coachB.client
      .from("exercises")
      .select("id")
      .eq("id", created.data!.id);
    expect(seenByB.data).toEqual([]);
  });

  it("a coach cannot update a global, admin-curated exercise", async () => {
    const globalRow = await admin
      .from("exercises")
      .select("id, name_en")
      .is("coach_id", null)
      .limit(1)
      .single();

    const update = await coachA.client
      .from("exercises")
      .update({ name_en: "Hijacked" })
      .eq("id", globalRow.data!.id)
      .select("id");
    expect(update.data).toEqual([]);
  });
});

describe("form_templates: coach-authored, tenant-scoped", () => {
  it("a template is invisible outside its coach's tenant", async () => {
    const created = await coachA.client
      .from("form_templates")
      .insert({ coach_id: coachA.userId, kind: "intake", name_ar: "استمارة", name_en: "Intake" })
      .select("id")
      .single();
    expect(created.error).toBeNull();

    const seenByB = await coachB.client
      .from("form_templates")
      .select("id")
      .eq("id", created.data!.id);
    expect(seenByB.data).toEqual([]);
  });
});

describe("clients cannot write into their own coach's tenant tables", () => {
  // Regression test for a real bug caught during development: the first
  // draft of private.coach_id() resolved the same tenant id for coach AND
  // client roles, so a client whose tenant matched could satisfy a write
  // policy meant for coaches only (insert a fake client, forge an invite,
  // edit the exercise library). Fixed by splitting tenant_id() (read,
  // coach-or-client) from coach_id() (write, coach-only, null for a
  // client). This test fails again if that split regresses.
  it("a client cannot insert another client row into their own coach's roster", async () => {
    const clientAccount = await createCoach("client-host"); // reuse the helper for a fresh auth user
    const clientId = await linkAsClient(coachA.userId, clientAccount.userId);
    expect(clientId).toBeTruthy();

    const forged = await clientAccount.client
      .from("clients")
      .insert({ coach_id: coachA.userId, display_name: "Sneaky" });
    expect(forged.error).not.toBeNull();
  });

  it("a client cannot write a custom exercise into their coach's library", async () => {
    const clientAccount = await createCoach("client-writer");
    await linkAsClient(coachA.userId, clientAccount.userId);

    const res = await clientAccount.client
      .from("exercises")
      .insert({ coach_id: coachA.userId, name_ar: "ممنوع", name_en: "Should not exist" });
    expect(res.error).not.toBeNull();
  });

  it("a client CAN read (but not write) their coach's custom exercises", async () => {
    const custom = await coachA.client
      .from("exercises")
      .insert({ coach_id: coachA.userId, name_ar: "قراءة", name_en: "Readable" })
      .select("id")
      .single();

    const clientAccount = await createCoach("client-reader");
    await linkAsClient(coachA.userId, clientAccount.userId);

    const seen = await clientAccount.client
      .from("exercises")
      .select("id")
      .eq("id", custom.data!.id);
    expect(seen.data).toHaveLength(1);
  });
});

describe("media: coach reads, client owns (progress photos)", () => {
  it("a foreign coach never sees another coach's client's media", async () => {
    const clientAccount = await createCoach("media-foreign");
    const clientId = await linkAsClient(coachA.userId, clientAccount.userId);

    const row = await clientAccount.client
      .from("media")
      .insert({
        coach_id: coachA.userId,
        client_id: clientId,
        storage_path: `${coachA.userId}/${clientId}/isolation-test.jpg`,
        kind: "photo",
      })
      .select("id")
      .single();
    expect(row.error).toBeNull();

    const seenByB = await coachB.client.from("media").select("id").eq("id", row.data!.id);
    expect(seenByB.data).toEqual([]);
  });

  // Pins a deliberate design decision (see the 20260731000009_progress.sql
  // comment): checkins/body_metrics/media are client-authored, and a coach
  // editing a client's self-reported data would be misleading. media's
  // coach_read policy is FOR SELECT only — no coach INSERT path exists. If
  // this test starts failing because a future migration adds one, that's a
  // deliberate product decision to re-confirm, not a regression to silently
  // let through.
  it("a coach cannot insert a media row for their own client — read-only by design", async () => {
    const clientAccount = await createCoach("media-coach-insert");
    const clientId = await linkAsClient(coachA.userId, clientAccount.userId);

    const res = await coachA.client.from("media").insert({
      coach_id: coachA.userId,
      client_id: clientId,
      storage_path: `${coachA.userId}/${clientId}/coach-upload.jpg`,
      kind: "photo",
    });
    expect(res.error).not.toBeNull();
  });

  it("a client can insert their own media row, and their coach can then read it", async () => {
    const clientAccount = await createCoach("media-client-owner");
    const clientId = await linkAsClient(coachA.userId, clientAccount.userId);

    const inserted = await clientAccount.client
      .from("media")
      .insert({
        coach_id: coachA.userId,
        client_id: clientId,
        storage_path: `${coachA.userId}/${clientId}/own-photo.jpg`,
        kind: "photo",
      })
      .select("id")
      .single();
    expect(inserted.error).toBeNull();

    const seenByCoach = await coachA.client.from("media").select("id").eq("id", inserted.data!.id);
    expect(seenByCoach.data).toHaveLength(1);
  });
});
