import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Read shape: the base Row plus what only the exercises_visible/foods_visible
// views add (20260805000001_library_clone.sql) — the cloned-from row's own
// name (so "Based on" survives a rename) and my_clone_id (whether the caller
// has already cloned this row). The generated view Row type marks every
// column nullable (views don't carry NOT NULL metadata), which would make
// `name_ar`/`name_en` etc. optional for callers like pickLocale that assume
// they're always present on a row that came back at all — .returns<T>() below
// re-asserts the base table's real nullability instead of the view's.
type Exercise = Database["public"]["Tables"]["exercises"]["Row"] & {
  source_name_ar: string | null;
  source_name_en: string | null;
  my_clone_id: string | null;
};
type Food = Database["public"]["Tables"]["foods"]["Row"] & {
  source_name_ar: string | null;
  source_name_en: string | null;
  my_clone_id: string | null;
};

export type CreateExerciseInput = {
  name_ar: string;
  name_en: string;
  muscle_group?: string;
  equipment?: string;
  video_url?: string;
  image_url?: string;
  instructions_ar?: string;
  instructions_en?: string;
  cues_ar?: string[];
  cues_en?: string[];
  coach_notes_ar?: string;
  coach_notes_en?: string;
  /** Set once at creation (the clone flow) — updateExercise strips it back
   * out of any later edit payload, so provenance can't be rewritten after
   * the fact. */
  source_exercise_id?: string;
};

/** Which half of the library to show. Derived from `coach_id is null`, not
 * stored — a `visibility` column would duplicate the nullable FK and allow
 * the impossible state (visibility GLOBAL + a coach_id). */
export type LibrarySource = "all" | "global" | "mine";

export type LibraryQuery = {
  query?: string;
  source?: LibrarySource;
  /** `muscle_group` for exercises, `category` for foods. Null = every group. */
  group?: string | null;
  /** 1-based. */
  page?: number;
  pageSize?: number;
};

export type LibraryPage<T> = { rows: T[]; total: number; page: number; pageSize: number };

const DEFAULT_PAGE_SIZE = 24;
// Caps what one request can pull regardless of what a caller asks for — the
// page size reaches this layer from the client, so it is an input bound, not
// a UI preference.
const MAX_PAGE_SIZE = 100;

// PostgREST's code for "Requested range not satisfiable": the offset is past
// the last row. Happens when the row a coach was looking at gets deleted and
// the page they're on no longer exists.
const RANGE_NOT_SATISFIABLE = "PGRST103";

export type CreateFoodInput = {
  name_ar: string;
  name_en: string;
  serving_label: string;
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  category: string;
  notes_ar?: string;
  notes_en?: string;
  /** Same rule as CreateExerciseInput.source_exercise_id — set once, stripped
   * out on every subsequent update. */
  source_food_id?: string;
};

// `,()` are PostgREST's or()-filter list/grouping syntax — stripping them
// keeps a search like "3,5kg" from being parsed as filter structure instead
// of a literal string. Not a tenant-isolation concern (RLS still scopes
// every row regardless of how the filter is built), just correctness.
function sanitizeSearchTerm(query: string) {
  return query.replace(/[,()%]/g, " ").trim();
}

/** "mine" needs no `coach_id = <me>` clause: RLS's read_own_and_global
 * already makes "a non-global row I can see" mean exactly "my row", so the
 * caller never has to hand us a coach id — which would be an authorization
 * decision taken client-side. For an admin (admin_read_all) the same filter
 * reads as "every coach-created row", which is what the admin UI wants.
 *
 * "all" used to mean no predicate at all. Now that a global can have a
 * coach's clone sitting next to it, "all" means every row minus the globals
 * the caller has already cloned — my_clone_id is null for every row except
 * a global with a clone, so this is the one predicate that de-dupes without
 * needing a caller-supplied id either. */
function applySource<
  Q extends {
    is: (c: "coach_id" | "my_clone_id", v: null) => Q;
    not: (c: "coach_id", op: "is", v: null) => Q;
  },
>(q: Q, source: LibrarySource): Q {
  if (source === "global") return q.is("coach_id", null);
  if (source === "mine") return q.not("coach_id", "is", null);
  return q.is("my_clone_id", null);
}

function normalizePaging(params: Pick<LibraryQuery, "page" | "pageSize">) {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(params.pageSize ?? DEFAULT_PAGE_SIZE)));
  return { page, pageSize };
}

type PagedResult<T> = PromiseLike<{ data: T[] | null; count: number | null; error: { code?: string } | null }>;

/** Runs a range-limited query and, if the offset lands past the last row
 * (PGRST103 — e.g. the coach was on page 5 and a row got deleted), retries
 * once at page 1 instead of surfacing an error for a page that no longer
 * exists. */
async function runPaged<T>(
  build: (page: number) => PagedResult<T>,
  page: number,
  pageSize: number
): Promise<LibraryPage<T>> {
  let effectivePage = page;
  let { data, count, error } = await build(effectivePage);
  if (error?.code === RANGE_NOT_SATISFIABLE && effectivePage !== 1) {
    effectivePage = 1;
    ({ data, count, error } = await build(effectivePage));
  }
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0, page: effectivePage, pageSize };
}

/** Global (admin-curated, coach_id null) + per-coach exercise and food
 * entries. Reused by the coach's library page and, later, the forms
 * builder's exercise_ref/food_ref field pickers — see build plan Phase 5. */
export class LibraryService {
  constructor(private db: SupabaseClient<Database>) {}

  // Reads go through exercises_visible/foods_visible (20260805000001), not
  // the base table — that's what adds my_clone_id and source_name_*. Writes
  // below stay on the base table; the view is select-only.
  async searchExercises(params: LibraryQuery = {}): Promise<LibraryPage<Exercise>> {
    const { page, pageSize } = normalizePaging(params);
    const build = (p: number) => {
      let q = this.db
        .from("exercises_visible")
        .select("*", { count: "exact" })
        .order("name_en")
        .order("id");
      q = applySource(q, params.source ?? "all");
      if (params.group) q = q.eq("muscle_group", params.group);
      const term = sanitizeSearchTerm(params.query ?? "");
      if (term) q = q.or(`name_ar.ilike.%${term}%,name_en.ilike.%${term}%`);
      // .returns<T>() has to be the true last call in the chain (supabase-js
      // narrows its return type to drop the filter methods once called) —
      // hence it's on .range() here, not up by .select() with the others.
      return q.range((p - 1) * pageSize, p * pageSize - 1).returns<Exercise[]>();
    };
    return runPaged(build, page, pageSize);
  }

  async searchFoods(params: LibraryQuery = {}): Promise<LibraryPage<Food>> {
    const { page, pageSize } = normalizePaging(params);
    const build = (p: number) => {
      let q = this.db
        .from("foods_visible")
        .select("*", { count: "exact" })
        .order("name_en")
        .order("id");
      q = applySource(q, params.source ?? "all");
      if (params.group) q = q.eq("category", params.group);
      const term = sanitizeSearchTerm(params.query ?? "");
      if (term) q = q.or(`name_ar.ilike.%${term}%,name_en.ilike.%${term}%`);
      return q.range((p - 1) * pageSize, p * pageSize - 1).returns<Food[]>();
    };
    return runPaged(build, page, pageSize);
  }

  /** Used by "Edit my version" on a global card that's already been cloned:
   * my_clone_id names the clone's row but not its (possibly renamed) fields,
   * so the edit dialog needs a fresh read of the clone itself before it can
   * prefill. Same view as search, no paging — a single row by id. */
  async getExercise(id: string): Promise<Exercise | null> {
    const { data, error } = await this.db.from("exercises_visible").select("*").eq("id", id).returns<Exercise[]>();
    if (error) throw error;
    return data[0] ?? null;
  }

  async getFood(id: string): Promise<Food | null> {
    const { data, error } = await this.db.from("foods_visible").select("*").eq("id", id).returns<Food[]>();
    if (error) throw error;
    return data[0] ?? null;
  }

  async createExercise(coachId: string, input: CreateExerciseInput) {
    const { data, error } = await this.db
      .from("exercises")
      .insert({ coach_id: coachId, ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async createFood(coachId: string, input: CreateFoodInput) {
    const { data, error } = await this.db
      .from("foods")
      .insert({ coach_id: coachId, ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Admin edit of a global row, or a coach editing their own. Neither is
   * checked here — RLS decides, and an unauthorized update simply matches 0
   * rows. Callers that need to tell "forbidden" from "no-op" should re-read.
   *
   * source_exercise_id is dropped from the payload even if a caller passes
   * one: provenance is set once, at creation (the clone flow), and is not
   * meant to be user-editable afterwards — stripping it here rather than
   * just omitting it from the edit form means a crafted payload can't
   * rewrite "Based on" after the fact. */
  async updateExercise(id: string, input: CreateExerciseInput): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to drop it from patch
    const { source_exercise_id: _sourceExerciseId, ...patch } = input;
    const { data, error } = await this.db.from("exercises").update(patch).eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async updateFood(id: string, input: CreateFoodInput): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to drop it from patch
    const { source_food_id: _sourceFoodId, ...patch } = input;
    const { data, error } = await this.db.from("foods").update(patch).eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** Admin-only, enforced inside the function (not by RLS — this is the one
   * legitimate cross-coach write, so it runs security definer and notifies
   * the former owner). Reassigns in place, so plan references survive. */
  async promoteExercise(id: string) {
    const { error } = await this.db.rpc("admin_promote_exercise", { p_id: id });
    if (error) throw error;
  }

  async promoteFood(id: string) {
    const { error } = await this.db.rpc("admin_promote_food", { p_id: id });
    if (error) throw error;
  }

  async createGlobalExercise(input: CreateExerciseInput) {
    const { data, error } = await this.db
      .from("exercises")
      .insert({ coach_id: null, ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async createGlobalFood(input: CreateFoodInput) {
    const { data, error } = await this.db
      .from("foods")
      .insert({ coach_id: null, ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Returns false when RLS matched no row (the coach doesn't own it, or it
   * is global). Postgres reports that as a successful 0-row delete, not an
   * error, so without the `select()` the caller cannot tell "deleted" from
   * "not allowed" — which is how a forbidden delete used to look like a
   * success in the UI. A genuine failure (e.g. 23503 in_use) still throws. */
  async deleteExercise(id: string): Promise<boolean> {
    const { data, error } = await this.db.from("exercises").delete().eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async deleteFood(id: string): Promise<boolean> {
    const { data, error } = await this.db.from("foods").delete().eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** Kanban drag-drop between muscle-group columns. RLS's update_own policy
   * already scopes this to the coach's own rows — dragging a global
   * (admin-curated) card is disabled in the UI rather than handled here,
   * since the update would just silently affect 0 rows. */
  async updateExerciseGroup(id: string, muscleGroup: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("exercises")
      .update({ muscle_group: muscleGroup })
      .eq("id", id)
      .select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async updateFoodCategory(id: string, category: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("foods")
      .update({ category })
      .eq("id", id)
      .select("id");
    if (error) throw error;
    return data.length > 0;
  }
}
