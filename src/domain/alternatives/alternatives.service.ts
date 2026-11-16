import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

/** The exercise columns an alternative carries: everything the client's swap
 * sheet / workout runner needs to show and log the exercise (it IS a
 * SwapExercise), plus equipment/primary_muscles for the suggestion ranking. */
export const ALTERNATIVE_EXERCISE_COLUMNS =
  "id, name_ar, name_en, muscle_group, equipment, primary_muscles, video_url, image_url, thumbnail_url, cues_ar, cues_en, steps_ar, steps_en, mistakes_ar, mistakes_en, safety_ar, safety_en, tempo, measurement_type, archived_at";

export type AlternativeExercise = Pick<
  ExerciseRow,
  | "id"
  | "name_ar"
  | "name_en"
  | "muscle_group"
  | "equipment"
  | "primary_muscles"
  | "video_url"
  | "image_url"
  | "thumbnail_url"
  | "cues_ar"
  | "cues_en"
  | "steps_ar"
  | "steps_en"
  | "mistakes_ar"
  | "mistakes_en"
  | "safety_ar"
  | "safety_en"
  | "tempo"
  | "measurement_type"
  | "archived_at"
>;

export type AlternativeRow = {
  exercise_id: string;
  program_item_id: string | null;
  coach_id: string | null;
  sort_order: number;
  alternative: AlternativeExercise | null;
};

export const MAX_ALTERNATIVES = 10;

const ALT_FK = "exercise_alternatives_alternative_exercise_id_fkey";
// Typed as string on purpose: .returns<AlternativeRow[]>() below is the
// contract, and it skips supabase-js parsing the embed hint at the type level.
const SELECT: string = `exercise_id, program_item_id, coach_id, sort_order, alternative:exercises!${ALT_FK}(${ALTERNATIVE_EXERCISE_COLUMNS})`;

function ordered(rows: AlternativeRow[]): AlternativeExercise[] {
  return rows
    .filter((r): r is AlternativeRow & { alternative: AlternativeExercise } => !!r.alternative && !r.alternative.archived_at)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => r.alternative);
}

/** Library list for one exercise: the coach's own rows win; platform rows
 * (coach_id null) are the fallback when the coach has none. */
function pickLibrary(rows: AlternativeRow[]): AlternativeExercise[] {
  const own = rows.filter((r) => r.coach_id !== null);
  return ordered(own.length > 0 ? own : rows);
}

/** Alternatives per program item: an item's override rows REPLACE the
 * library list; with none, the item inherits its exercise's library list. */
export function resolveAlternatives(
  items: readonly { id: string; exercise_id: string }[],
  overrideRows: readonly AlternativeRow[],
  libraryRows: readonly AlternativeRow[]
): Record<string, AlternativeExercise[]> {
  const out: Record<string, AlternativeExercise[]> = {};
  for (const item of items) {
    const override = overrideRows.filter((r) => r.program_item_id === item.id);
    out[item.id] =
      override.length > 0
        ? ordered(override)
        : pickLibrary(libraryRows.filter((r) => r.exercise_id === item.exercise_id));
  }
  return out;
}

type Scope = { exerciseId: string; coachId: string; programItemId: string | null };

/** RLS decides who may read/write (see 20261122000001_exercise_alternatives.sql);
 * nothing here checks permissions. */
export class AlternativesService {
  constructor(private db: SupabaseClient<Database>) {}

  /** Alternatives the coach set on this exercise (their own rows only: this
   * is what the library form edits and saves back). */
  async listOwnLibrary(coachId: string, exerciseId: string): Promise<AlternativeExercise[]> {
    const { data, error } = await this.db
      .from("exercise_alternatives")
      .select(SELECT)
      .eq("exercise_id", exerciseId)
      .eq("coach_id", coachId)
      .is("program_item_id", null)
      .returns<AlternativeRow[]>();
    if (error) throw error;
    return ordered(data);
  }

  /** Library list as the caller sees it (own coach's rows, else platform's):
   * the "inherited" list a program item falls back to. */
  async listLibrary(exerciseId: string): Promise<AlternativeExercise[]> {
    const { data, error } = await this.db
      .from("exercise_alternatives")
      .select(SELECT)
      .eq("exercise_id", exerciseId)
      .is("program_item_id", null)
      .returns<AlternativeRow[]>();
    if (error) throw error;
    return pickLibrary(data);
  }

  /** Only this item's override rows (empty = it inherits the library). */
  async listOverride(programItemId: string): Promise<AlternativeExercise[]> {
    const { data, error } = await this.db
      .from("exercise_alternatives")
      .select(SELECT)
      .eq("program_item_id", programItemId)
      .returns<AlternativeRow[]>();
    if (error) throw error;
    return ordered(data);
  }

  /** What the client sees for each item (override, else library). */
  async listForItems(
    items: readonly { id: string; exercise_id: string }[]
  ): Promise<Record<string, AlternativeExercise[]>> {
    if (items.length === 0) return {};
    const itemIds = items.map((i) => i.id);
    const exerciseIds = [...new Set(items.map((i) => i.exercise_id))];
    const [overrides, library] = await Promise.all([
      this.db.from("exercise_alternatives").select(SELECT).in("program_item_id", itemIds).returns<AlternativeRow[]>(),
      this.db
        .from("exercise_alternatives")
        .select(SELECT)
        .in("exercise_id", exerciseIds)
        .is("program_item_id", null)
        .returns<AlternativeRow[]>(),
    ]);
    if (overrides.error) throw overrides.error;
    if (library.error) throw library.error;
    return resolveAlternatives(items, overrides.data, library.data);
  }

  setLibrary(coachId: string, exerciseId: string, alternativeIds: readonly string[]) {
    return this.replace({ exerciseId, coachId, programItemId: null }, alternativeIds);
  }

  setItemOverride(coachId: string, programItemId: string, exerciseId: string, alternativeIds: readonly string[]) {
    return this.replace({ exerciseId, coachId, programItemId }, alternativeIds);
  }

  async clearItemOverride(programItemId: string): Promise<void> {
    const { error } = await this.db.from("exercise_alternatives").delete().eq("program_item_id", programItemId);
    if (error) throw error;
  }

  /** An override is for one exercise; when the item's exercise changes the
   * old rows no longer apply (and the RLS check ties them to the item's
   * exercise), so drop them. */
  async dropStaleOverrides(programItemId: string, exerciseId: string): Promise<void> {
    const { error } = await this.db
      .from("exercise_alternatives")
      .delete()
      .eq("program_item_id", programItemId)
      .neq("exercise_id", exerciseId);
    if (error) throw error;
  }

  /** "Duplicate item" keeps the client-specific alternatives with the copy. */
  async copyOverrides(fromItemId: string, toItemId: string): Promise<void> {
    const { data, error } = await this.db
      .from("exercise_alternatives")
      .select("exercise_id, alternative_exercise_id, coach_id, sort_order")
      .eq("program_item_id", fromItemId);
    if (error) throw error;
    if (data.length === 0) return;
    const { error: insertError } = await this.db
      .from("exercise_alternatives")
      .insert(data.map((r) => ({ ...r, program_item_id: toItemId })));
    if (insertError) throw insertError;
  }

  /** Make the scope's rows equal `alternativeIds` (order = sort_order) with a
   * diff, not delete-all + insert, so a failed insert can't wipe the list:
   * add new, drop removed, re-number kept. */
  private async replace(scope: Scope, alternativeIds: readonly string[]): Promise<void> {
    const ids = [...new Set(alternativeIds)].filter((id) => id !== scope.exerciseId).slice(0, MAX_ALTERNATIVES);

    let existingQuery = this.db
      .from("exercise_alternatives")
      .select("id, alternative_exercise_id, sort_order")
      .eq("exercise_id", scope.exerciseId)
      .eq("coach_id", scope.coachId);
    existingQuery = scope.programItemId
      ? existingQuery.eq("program_item_id", scope.programItemId)
      : existingQuery.is("program_item_id", null);
    const { data: existing, error: readError } = await existingQuery;
    if (readError) throw readError;

    const byAlt = new Map(existing.map((r) => [r.alternative_exercise_id, r]));
    const removed = existing.filter((r) => !ids.includes(r.alternative_exercise_id)).map((r) => r.id);

    const added = ids
      .map((id, sort_order) => ({ id, sort_order }))
      .filter(({ id }) => !byAlt.has(id))
      .map(({ id, sort_order }) => ({
        exercise_id: scope.exerciseId,
        alternative_exercise_id: id,
        coach_id: scope.coachId,
        program_item_id: scope.programItemId,
        sort_order,
      }));
    if (added.length > 0) {
      const { error } = await this.db.from("exercise_alternatives").insert(added);
      if (error) throw error;
    }

    if (removed.length > 0) {
      const { error } = await this.db.from("exercise_alternatives").delete().in("id", removed);
      if (error) throw error;
    }

    for (const [sort_order, id] of ids.entries()) {
      const row = byAlt.get(id);
      if (!row || row.sort_order === sort_order) continue;
      const { error } = await this.db.from("exercise_alternatives").update({ sort_order }).eq("id", row.id);
      if (error) throw error;
    }
  }
}
