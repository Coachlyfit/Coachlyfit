// Covers the DB-permission half of the library's kanban drag-drop: a coach
// can move their own custom entry between columns (update muscle_group /
// category), but the same update against a global, admin-curated entry is
// rejected — exactly what KanbanBoard's onMove ultimately depends on. The
// drag GESTURE itself is dnd-kit's own tested pointer-sensor mechanism, not
// something re-verified here.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { LibraryService } from "@/domain/library/library.service";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY!;

const admin = createClient<Database>(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function createCoach(tag: string) {
  const email = `move-coach-${tag}-${Date.now()}@example.test`;
  const password = "correct horse battery staple";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "coach", full_name: `Coach ${tag}`, business_name: `${tag} Gym`, locale: "ar" },
  });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");

  const client = createClient<Database>(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { userId: data.user.id, client };
}

let coach: { userId: string; client: SupabaseClient<Database> };

beforeAll(async () => {
  coach = await createCoach("a");
}, 30_000);

describe("kanban move persistence", () => {
  it("moves a coach's own custom exercise to a new muscle-group column", async () => {
    const library = new LibraryService(coach.client);
    const created = await library.createExercise(coach.userId, {
      name_ar: "تمرين",
      name_en: "Drag Test Exercise",
      muscle_group: "other",
    });

    await library.updateExerciseGroup(created.id, "shoulders");

    const { data } = await coach.client
      .from("exercises")
      .select("muscle_group")
      .eq("id", created.id)
      .single();
    expect(data?.muscle_group).toBe("shoulders");
  });

  it("moves a coach's own custom food to a new category column", async () => {
    const library = new LibraryService(coach.client);
    const created = await library.createFood(coach.userId, {
      name_ar: "طعام",
      name_en: "Drag Test Food",
      serving_label: "100g",
      kcal: 100,
      protein_g: 5,
      carb_g: 10,
      fat_g: 2,
      category: "other",
    });

    await library.updateFoodCategory(created.id, "protein");

    const { data } = await coach.client.from("foods").select("category").eq("id", created.id).single();
    expect(data?.category).toBe("protein");
  });

  it("rejects moving a global (admin-curated) exercise — the KanbanBoard disables dragging these for the same reason", async () => {
    const globalRow = await admin
      .from("exercises")
      .select("id, muscle_group")
      .is("coach_id", null)
      .limit(1)
      .single();

    const library = new LibraryService(coach.client);
    await library.updateExerciseGroup(globalRow.data!.id, "cardio");

    const after = await admin
      .from("exercises")
      .select("muscle_group")
      .eq("id", globalRow.data!.id)
      .single();
    // RLS silently drops the update (0 rows affected) rather than erroring —
    // the row is unchanged.
    expect(after.data?.muscle_group).toBe(globalRow.data!.muscle_group);
  });
});
