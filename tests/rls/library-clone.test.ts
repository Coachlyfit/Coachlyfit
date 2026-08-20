// Clone & Customize (20260805000001_library_clone.sql): a coach copies a
// global exercise/food into their own library and edits it independently.
// The guarantee under test is the same shape as library-source.test.ts's —
// enforced by Postgres (the partial unique index, the on-delete-set-null FK,
// and the exercises_visible/foods_visible views), not by the UI — plus it
// closes library-source.test.ts's existing zero-food-RLS-coverage gap.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { LibraryService } from "@/domain/library/library.service";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY!;

const service = createClient<Database>(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function signIn(email: string, password: string) {
  const client = createClient<Database>(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

const PASSWORD = "correct horse battery staple";

async function createCoach(tag: string) {
  const email = `clone-coach-${tag}-${Date.now()}@example.test`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role: "coach", full_name: `Coach ${tag}`, business_name: `${tag} Gym`, locale: "en" },
  });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  return { userId: data.user.id, client: await signIn(email, PASSWORD) };
}

async function createAdmin() {
  const email = `clone-admin-${Date.now()}@example.test`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role: "admin", full_name: "Platform Admin", locale: "en" },
  });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  const update = await service.from("profiles").update({ role: "admin" }).eq("id", data.user.id);
  if (update.error) throw update.error;
  return { userId: data.user.id, client: await signIn(email, PASSWORD) };
}

let coachA: { userId: string; client: SupabaseClient<Database> };
let coachB: { userId: string; client: SupabaseClient<Database> };
let admin: { userId: string; client: SupabaseClient<Database> };

beforeAll(async () => {
  [coachA, coachB, admin] = await Promise.all([createCoach("a"), createCoach("b"), createAdmin()]);
}, 60_000);

describe("exercise clone", () => {
  let globalExercise: { id: string; name_en: string };
  let clone: { id: string; coach_id: string | null };

  beforeAll(async () => {
    globalExercise = await new LibraryService(admin.client).createGlobalExercise({
      name_ar: "تمرين عام للنسخ",
      name_en: "Clonable Global Exercise",
      muscle_group: "chest",
    });
    clone = await new LibraryService(coachA.client).createExercise(coachA.userId, {
      name_ar: "نسختي من التمرين",
      name_en: "My Version",
      muscle_group: "chest",
      instructions_en: "Coach A's own instructions",
      source_exercise_id: globalExercise.id,
    });
  }, 30_000);

  it("creates an independent copy — the global row is untouched", async () => {
    expect(clone.coach_id).toBe(coachA.userId);

    const original = await service.from("exercises").select("name_en, coach_id").eq("id", globalExercise.id).single();
    expect(original.data?.name_en).toBe("Clonable Global Exercise");
    expect(original.data?.coach_id).toBeNull();
  });

  it("coach B cannot see coach A's clone under any source", async () => {
    const libraryB = new LibraryService(coachB.client);
    for (const source of ["all", "global", "mine"] as const) {
      const { rows } = await libraryB.searchExercises({ source });
      expect(rows.map((r) => r.id)).not.toContain(clone.id);
    }
  });

  it("coach A can edit their own clone; still cannot edit the global it came from", async () => {
    const library = new LibraryService(coachA.client);
    expect(
      await library.updateExercise(clone.id, {
        name_ar: "نسختي من التمرين",
        name_en: "My Version, Renamed",
      })
    ).toBe(true);

    expect(
      await library.updateExercise(globalExercise.id, {
        name_ar: "مسروق",
        name_en: "Hacked",
      })
    ).toBe(false);
  });

  it("exercises_visible hides the cloned global from A's 'all' but not B's, and reports my_clone_id correctly", async () => {
    const [allA, allB, globalListA] = await Promise.all([
      new LibraryService(coachA.client).searchExercises({ source: "all" }),
      new LibraryService(coachB.client).searchExercises({ source: "all" }),
      new LibraryService(coachA.client).searchExercises({ source: "global" }),
    ]);
    expect(allA.rows.map((r) => r.id)).not.toContain(globalExercise.id);
    expect(allB.rows.map((r) => r.id)).toContain(globalExercise.id);

    // "global" always lists every global row, cloned or not.
    const globalRowForA = globalListA.rows.find((r) => r.id === globalExercise.id);
    expect(globalRowForA?.my_clone_id).toBe(clone.id);

    const globalListB = await new LibraryService(coachB.client).searchExercises({ source: "global" });
    const globalRowForB = globalListB.rows.find((r) => r.id === globalExercise.id);
    expect(globalRowForB?.my_clone_id).toBeNull();
  });

  it("rejects a second clone of the same global instead of creating a duplicate", async () => {
    await expect(
      new LibraryService(coachA.client).createExercise(coachA.userId, {
        name_ar: "محاولة تانية",
        name_en: "Second Attempt",
        source_exercise_id: globalExercise.id,
      })
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("getExercise reads the clone back through the view, with source_name_* attached", async () => {
    const fetched = await new LibraryService(coachA.client).getExercise(clone.id);
    expect(fetched?.name_en).toBe("My Version, Renamed");
    expect(fetched?.source_name_en).toBe("Clonable Global Exercise");
  });

  it("deleting the global nulls the clone's source_exercise_id instead of cascading", async () => {
    const deleted = await service.from("exercises").delete().eq("id", globalExercise.id).select("id");
    expect(deleted.error).toBeNull();

    const survivor = await service
      .from("exercises")
      .select("id, coach_id, source_exercise_id")
      .eq("id", clone.id)
      .single();
    expect(survivor.data?.coach_id).toBe(coachA.userId);
    expect(survivor.data?.source_exercise_id).toBeNull();
  });
});

describe("food clone", () => {
  let globalFood: { id: string; name_en: string };
  let clone: { id: string; coach_id: string | null };

  beforeAll(async () => {
    globalFood = await new LibraryService(admin.client).createGlobalFood({
      name_ar: "طعام عام للنسخ",
      name_en: "Clonable Global Food",
      serving_label: "100g",
      kcal: 150,
      protein_g: 10,
      carb_g: 20,
      fat_g: 2,
      category: "protein",
    });
    clone = await new LibraryService(coachA.client).createFood(coachA.userId, {
      name_ar: "نسختي من الطعام",
      name_en: "My Food Version",
      serving_label: "100g",
      kcal: 150,
      protein_g: 10,
      carb_g: 20,
      fat_g: 2,
      category: "protein",
      notes_en: "Coach A's own serving guidance",
      source_food_id: globalFood.id,
    });
  }, 30_000);

  it("creates an independent copy — the global row is untouched", async () => {
    expect(clone.coach_id).toBe(coachA.userId);
    const original = await service.from("foods").select("name_en, coach_id").eq("id", globalFood.id).single();
    expect(original.data?.name_en).toBe("Clonable Global Food");
    expect(original.data?.coach_id).toBeNull();
  });

  it("coach B cannot see coach A's clone under any source", async () => {
    const libraryB = new LibraryService(coachB.client);
    for (const source of ["all", "global", "mine"] as const) {
      const { rows } = await libraryB.searchFoods({ source });
      expect(rows.map((r) => r.id)).not.toContain(clone.id);
    }
  });

  it("coach A can edit their own clone; still cannot edit the global it came from", async () => {
    const library = new LibraryService(coachA.client);
    expect(
      await library.updateFood(clone.id, {
        name_ar: "نسختي من الطعام",
        name_en: "My Food Version, Renamed",
        serving_label: "100g",
        kcal: 150,
        protein_g: 10,
        carb_g: 20,
        fat_g: 2,
        category: "protein",
      })
    ).toBe(true);

    expect(
      await library.updateFood(globalFood.id, {
        name_ar: "مسروق",
        name_en: "Hacked",
        serving_label: "100g",
        kcal: 150,
        protein_g: 10,
        carb_g: 20,
        fat_g: 2,
        category: "protein",
      })
    ).toBe(false);
  });

  it("foods_visible hides the cloned global from A's 'all' but not B's", async () => {
    const [allA, allB] = await Promise.all([
      new LibraryService(coachA.client).searchFoods({ source: "all" }),
      new LibraryService(coachB.client).searchFoods({ source: "all" }),
    ]);
    expect(allA.rows.map((r) => r.id)).not.toContain(globalFood.id);
    expect(allB.rows.map((r) => r.id)).toContain(globalFood.id);
  });

  it("rejects a second clone of the same global", async () => {
    await expect(
      new LibraryService(coachA.client).createFood(coachA.userId, {
        name_ar: "محاولة تانية",
        name_en: "Second Attempt",
        serving_label: "100g",
        kcal: 150,
        protein_g: 10,
        carb_g: 20,
        fat_g: 2,
        category: "protein",
        source_food_id: globalFood.id,
      })
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("deleting the clone leaves the global untouched", async () => {
    const deleted = await new LibraryService(coachA.client).deleteFood(clone.id);
    expect(deleted).toBe(true);

    const original = await service.from("foods").select("name_en").eq("id", globalFood.id).single();
    expect(original.data?.name_en).toBe("Clonable Global Food");
  });
});
