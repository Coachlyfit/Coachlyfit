import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ProgressionRule } from "./progression";
import { DietPlansService } from "@/domain/nutrition/diet-plans.service";
import { normalizeSectionOrder } from "./day-sections";
import type { GroupConfig, GroupKind } from "./group-config";
import type { PlanGoal, PlanLevel, PlanType } from "./plan-meta";
import type { WeekPlan } from "./week-plan";

type Json = Database["public"]["Tables"]["program_items"]["Row"]["group_config"];

type Program = Database["public"]["Tables"]["programs"]["Row"];
type ProgramDay = Database["public"]["Tables"]["program_days"]["Row"];
type ProgramItem = Database["public"]["Tables"]["program_items"]["Row"];
type ProgramItemSet = Database["public"]["Tables"]["program_item_sets"]["Row"];
type ProgramActivity = Database["public"]["Tables"]["program_activities"]["Row"];
type RehabProtocol = Database["public"]["Tables"]["rehab_protocols"]["Row"];
type RehabPhase = Database["public"]["Tables"]["rehab_phases"]["Row"];
type Exercise = Database["public"]["Tables"]["exercises"]["Row"];
type DietPlan = Database["public"]["Tables"]["diet_plans"]["Row"];

export type ProgramScope = "all" | "assigned" | "templates";

/** Every program_items column except coach_note_private — see
 * getActiveTreeForClient's doc comment for why this exists as an explicit
 * list rather than `*`. Shared with any other client-facing select of this
 * table (e.g. the workout session page's own direct query) so there is one
 * place to update when a column is added. */
export const CLIENT_SAFE_ITEM_COLUMNS =
  "id, coach_id, client_id, program_day_id, exercise_id, sets, reps, rest_seconds, notes_ar, notes_en, order_index, progression_rule, group_key, group_kind, group_config, block, rehab_phase_id, tempo, per_side, scaled_notes_ar, scaled_notes_en";

export type CreateProgramInput = {
  client_id?: string | null;
  name_ar: string;
  name_en: string;
  start_date?: string;
  end_date?: string | null;
  schedule_mode?: "cycle" | "weekly";
  plan_type?: PlanType | null;
  goal?: PlanGoal | null;
  level?: PlanLevel | null;
  equipment?: string[];
  description_ar?: string | null;
  description_en?: string | null;
  /** Authored week plan (see week-plan.ts); null = default deload every 4th week. */
  week_plan?: WeekPlan | null;
};

export type CreateDayInput = {
  day_index: number;
  label_ar?: string;
  label_en?: string;
  weekday?: number | null;
  notes_ar?: string;
  notes_en?: string;
  diet_plan_id?: string | null;
};
export type UpdateDayInput = Partial<CreateDayInput>;

/** One prescribed set — the week-1 base that `progression.ts` projects onto
 * weeks 2-12. `weight: null` means bodyweight/unloaded; a negative weight is
 * assisted bodyweight work (see measurement.ts). At least one measure —
 * reps, duration_seconds, distance_m, calories or an `extra` metric — must be
 * set, matching the DB's program_item_sets_has_measure check; which ones a
 * set carries depends on the exercise's measurement_type. */
export type SetInput = {
  reps?: number | null;
  weight?: number | null;
  rest_seconds?: number | null;
  duration_seconds?: number | null;
  distance_m?: number | null;
  calories?: number | null;
  /** rounds, work_s, rest_s, level, incline, speed, laps, steps. */
  extra?: Record<string, number> | null;
  /** warmup | working | backoff | drop | failure | amrap (default working). */
  set_type?: string;
  /** Upper end of a rep range: reps 8, reps_max 12 = "8-12". */
  reps_max?: number | null;
  /** Load as % of the athlete's 1RM; resolved to kg by the runner. */
  pct_1rm?: number | null;
  rpe_target?: number | null;
  rir_target?: number | null;
};

export type CreateItemInput = {
  exercise_id: string;
  sets?: SetInput[];
  progression_rule?: ProgressionRule;
  notes_ar?: string;
  notes_en?: string;
  block?: "warmup" | "main" | "accessory" | "finisher" | "cooldown" | "mobility" | "rehab";
  /** Only meaningful when block = 'rehab' — which phase of the protocol
   * this item belongs to, so the client only sees it while that phase is
   * active (see day-plan.ts). */
  rehab_phase_id?: string | null;
  /** Coach-only annotation, never selected in a client-facing query — see
   * CLIENT_SAFE_ITEM_COLUMNS. */
  coach_note_private?: string;
  /** "3-1-1-0"; empty = none. */
  tempo?: string;
  per_side?: boolean;
  /** The Scaled option shown beside the Rx prescription. */
  scaled_notes_ar?: string;
  scaled_notes_en?: string;
};
export type UpdateItemInput = Partial<CreateItemInput>;

export type CreateActivityInput = {
  kind: "cardio" | "recovery";
  modality: string;
  duration_min?: number | null;
  distance_km?: number | null;
  intensity?: "low" | "moderate" | "high" | "intervals" | null;
  hr_zone?: number | null;
  kcal_target?: number | null;
  pace?: string | null;
  notes_ar?: string | null;
  notes_en?: string | null;
  log_required?: boolean;
};
export type UpdateActivityInput = Partial<CreateActivityInput>;

export type CreateRehabProtocolInput = {
  body_area: string;
  injury_ar?: string | null;
  injury_en?: string | null;
  restrictions_ar?: string | null;
  restrictions_en?: string | null;
  instructions_ar?: string | null;
  instructions_en?: string | null;
};
export type UpdateRehabProtocolInput = Partial<CreateRehabProtocolInput>;

export type CreateRehabPhaseInput = {
  name_ar: string;
  name_en: string;
  from_week: number;
  to_week: number;
  goals_ar?: string | null;
  goals_en?: string | null;
  progression_criteria_ar?: string | null;
  progression_criteria_en?: string | null;
};
export type UpdateRehabPhaseInput = Partial<CreateRehabPhaseInput>;

export type DietVariant = Pick<
  DietPlan,
  "id" | "name_ar" | "name_en" | "target_kcal" | "target_protein_g" | "target_carb_g" | "target_fat_g"
>;

export type ProgramTree = Program & {
  program_days: (ProgramDay & {
    program_items: (ProgramItem & {
      /** Coach-only note, loaded from program_item_notes (see withPrivateNote). */
      coach_note_private: string | null;
      exercises: Pick<
        Exercise,
        | "id"
        | "name_ar"
        | "name_en"
        | "muscle_group"
        | "video_url"
        | "cues_ar"
        | "cues_en"
        | "steps_ar"
        | "steps_en"
        | "mistakes_ar"
        | "mistakes_en"
        | "safety_ar"
        | "safety_en"
        | "tempo"
        | "primary_muscles"
        | "secondary_muscles"
        | "measurement_type"
      >;
      program_item_sets: ProgramItemSet[];
    })[];
    program_activities: ProgramActivity[];
  })[];
  rehab_protocols: (RehabProtocol & { rehab_phases: RehabPhase[] })[];
  /** Every program-owned nutrition variant (diet_plans where program_id =
   * this program), independent of which days link to which — the sidebar's
   * variant list and the day→variant assignment grid both read from here
   * rather than re-deriving it from program_days.diet_plan_id. */
  diet_variants: DietVariant[];
};

/** `client_id is null` on a nullable-FK own filter, the same idiom as
 * LibraryService's `applySource` for `coach_id is null`. */
function applyScope<Q extends { is: (c: "client_id", v: null) => Q; not: (c: "client_id", op: "is", v: null) => Q }>(
  q: Q,
  scope: ProgramScope
): Q {
  if (scope === "templates") return q.is("client_id", null);
  if (scope === "assigned") return q.not("client_id", "is", null);
  return q;
}

/** Legacy sets/reps/rest_seconds snapshot derived from a per-set array —
 * written alongside program_item_sets so any reader not yet migrated to the
 * real per-set data (item.sets/item.reps) still sees something sane. A
 * duration-only set (reps null) has no rep range to summarize; falls back
 * to "0" rather than crashing Math.min/max on an empty numeric list. */
function legacySnapshot(sets: SetInput[]) {
  const reps = sets.map((s) => s.reps).filter((r): r is number => r != null);
  const tops = sets.map((s) => s.reps_max ?? s.reps).filter((r): r is number => r != null);
  const min = reps.length > 0 ? Math.min(...reps) : 0;
  const max = tops.length > 0 ? Math.max(...tops) : 0;
  return {
    sets: sets.length,
    reps: min === max ? String(min) : `${min}-${max}`,
    rest_seconds: sets[0]?.rest_seconds ?? null,
  };
}

function setRows(sets: SetInput[], coachId: string, clientId: string | null, programItemId: string) {
  return sets.map((set, i) => ({
    coach_id: coachId,
    client_id: clientId,
    program_item_id: programItemId,
    set_index: i + 1,
    reps: set.reps ?? null,
    weight: set.weight ?? null,
    rest_seconds: set.rest_seconds ?? null,
    duration_seconds: set.duration_seconds ?? null,
    distance_m: set.distance_m ?? null,
    calories: set.calories ?? null,
    extra: set.extra ?? null,
    set_type: set.set_type ?? "working",
    reps_max: set.reps_max ?? null,
    pct_1rm: set.pct_1rm ?? null,
    rpe_target: set.rpe_target ?? null,
    rir_target: set.rir_target ?? null,
  }));
}

/** One prescribed set as the plain object replace_program_item_sets reads
 * (the same keys as program_item_sets, minus the ids it fills in itself). */
function setPayloads(sets: SetInput[]) {
  return sets.map((set) => ({
    reps: set.reps ?? null,
    weight: set.weight ?? null,
    rest_seconds: set.rest_seconds ?? null,
    duration_seconds: set.duration_seconds ?? null,
    distance_m: set.distance_m ?? null,
    calories: set.calories ?? null,
    extra: set.extra ?? null,
    set_type: set.set_type ?? "working",
    reps_max: set.reps_max ?? null,
    pct_1rm: set.pct_1rm ?? null,
    rpe_target: set.rpe_target ?? null,
    rir_target: set.rir_target ?? null,
  }));
}

/** Copies stored sets onto another item (clone, duplicate, restore). One place
 * for the column list so a new set column cannot be forgotten in one of the
 * four copy paths. */
function setCopyRows(
  sets: ProgramItemSet[],
  coachId: string,
  clientId: string | null,
  programItemId: string
) {
  return sets.map((set) => ({
    coach_id: coachId,
    client_id: clientId,
    program_item_id: programItemId,
    set_index: set.set_index,
    reps: set.reps,
    weight: set.weight,
    rest_seconds: set.rest_seconds,
    duration_seconds: set.duration_seconds,
    distance_m: set.distance_m,
    calories: set.calories,
    extra: set.extra,
    set_type: set.set_type,
    reps_max: set.reps_max,
    pct_1rm: set.pct_1rm,
    rpe_target: set.rpe_target,
    rir_target: set.rir_target,
  }));
}

/** The per-exercise options that every item copy must carry. */
function itemOptions(item: Pick<ProgramItem, "tempo" | "per_side" | "scaled_notes_ar" | "scaled_notes_en">) {
  return {
    tempo: item.tempo,
    per_side: item.per_side,
    scaled_notes_ar: item.scaled_notes_ar,
    scaled_notes_en: item.scaled_notes_en,
  };
}

/** The order a day's items should have after grouping `selectedIds`, or null
 * when the selection is not allowed: an item whose existing group is only
 * partly selected would leave that group split or orphaned. Selected items
 * keep their relative order and are gathered at the position of the first
 * selected one; everything else keeps its place. */
export function planGroupOrder(
  dayItems: { id: string; group_key: string | null }[],
  selectedIds: string[]
): string[] | null {
  const selected = new Set(selectedIds);
  const first = dayItems.findIndex((i) => selected.has(i.id));
  if (first === -1) return null;

  // Every existing group touched by the selection must be selected whole.
  const touched = new Set(dayItems.filter((i) => selected.has(i.id) && i.group_key).map((i) => i.group_key!));
  for (const item of dayItems) {
    if (item.group_key && touched.has(item.group_key) && !selected.has(item.id)) return null;
  }

  const block = dayItems.filter((i) => selected.has(i.id)).map((i) => i.id);
  const rest = dayItems.filter((i) => !selected.has(i.id)).map((i) => i.id);
  // Everything before `first` is unselected, so it is exactly rest[0..first).
  return [...rest.slice(0, first), ...block, ...rest.slice(first)];
}

/** The embed that brings an item's coach-only note along. `private_note` is a
 * one-to-one (the note table's primary key is the item id). */
const PRIVATE_NOTE_EMBED = "private_note:program_item_notes(note)";

type WithPrivateNote = { private_note?: { note: string } | null; coach_note_private?: string | null };

/** Folds the embedded note back onto the item as `coach_note_private`, the
 * property the builder and the clone/restore code have always read — so the
 * note's new home is invisible outside this service. Rows without the embed
 * (a snapshot, a fixture) keep whatever they already carry. */
function withPrivateNote<T extends WithPrivateNote>(item: T): Omit<T, "private_note"> & { coach_note_private: string | null } {
  const { private_note, ...rest } = item;
  return {
    ...rest,
    coach_note_private: private_note !== undefined ? (private_note?.note ?? null) : (item.coach_note_private ?? null),
  };
}

/** The slice of a PostgREST delete builder deleteExcept chains. */
type DeleteFilter = PromiseLike<{ error: { message: string } | null }> & {
  not: (column: string, operator: string, value: string) => DeleteFilter;
};

/** Coach-authored workout programs: standalone (assigned to one client) or
 * templates (client_id null, cloned onto a client later). Mirrors
 * LibraryService's shape — throws on a real error, returns `boolean`/`null`
 * from writes so an RLS no-op is distinguishable from success.
 *
 * The one non-obvious rule this service enforces: `program_days` and
 * `program_items` carry their own coach_id/client_id, and those values are
 * NEVER taken from a caller-supplied argument. `with check (coach_id =
 * private.coach_id())` stops a cross-tenant write but not a coach writing a
 * day whose client_id points at a *different client of their own* — which
 * would leak that program into the wrong client's `client_read_own` view.
 * So every child insert re-reads its RLS-scoped parent row and spreads the
 * parent's ids. If the parent isn't visible, nothing is inserted. */
export class ProgramsService {
  constructor(private db: SupabaseClient<Database>) {}

  /** RLS-scoped existence check for a caller-supplied client_id — `clients`
   * itself is coach_rw-gated, so a row only comes back if it belongs to
   * this coach's tenant. Guards every write that would otherwise take
   * client_id verbatim from an argument (create, cloneToClient): the FK
   * alone doesn't stop a coach from pointing a program at another coach's
   * client id, since foreign-key checks run with RLS bypassed. */
  private async assertOwnClient(clientId: string): Promise<void> {
    const { data, error } = await this.db.from("clients").select("id").eq("id", clientId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("client_not_found_or_forbidden");
  }

  async list(scope: ProgramScope = "all") {
    let q = this.db
      .from("programs")
      .select("*, clients(display_name)")
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    q = applyScope(q, scope);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  /** Everything the Programs page shows, in one round trip: every live
   * program (assigned and template) with its days, a per-day item count
   * (zero = rest day) and the sessions started in [fromIso, toIso). The page
   * derives plan and done/missed from this via week-status.ts — no per-client
   * or per-day follow-up query. RLS's coach_read on workout_sessions scopes
   * the embed the same way it scopes the programs themselves. */
  async listOverview(fromIso: string, toIso: string) {
    const { data, error } = await this.db
      .from("programs")
      .select(
        "*, clients(display_name), program_days(id, day_index, parent_day_id, weekday, label_ar, label_en, program_items(count), workout_sessions(started_at, completed_at))"
      )
      .is("archived_at", null)
      .gte("program_days.workout_sessions.started_at", fromIso)
      .lt("program_days.workout_sessions.started_at", toIso)
      .order("created_at", { ascending: false })
      .order("order_index", { referencedTable: "program_days" });
    if (error) throw error;
    return data;
  }

  async listArchived() {
    const { data, error } = await this.db
      .from("programs")
      .select("*, clients(display_name)")
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  /** Soft delete: stops the program appearing in list()/listArchived's
   * counterpart. Used by the coach-facing "Delete" action; the tree, child
   * rows, and any client-side reads by id are unaffected, so a mistaken
   * delete can be undone via restore(). */
  async archive(id: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("programs")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async restore(id: string): Promise<boolean> {
    const { data, error } = await this.db.from("programs").update({ archived_at: null }).eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** The client's current assigned (non-template) program, if any — a
   * client can have at most one active program in practice, so this just
   * takes the most recently created one rather than modeling an explicit
   * "active" flag that doesn't exist in the schema. Used by the client
   * app's Today/Plan tabs, which need the tree to compute day_index ->
   * date via program-cycle.ts.
   *
   * program_items is an EXPLICIT column list, not `*` — it must never
   * include coach_note_private, which is a coach-only annotation on a
   * prescription (see 20260904000001_program_item_block_and_private_note.sql).
   * RLS's client_read_own is a row policy; it has no way to hide one
   * column from an otherwise-visible row, so this select IS the boundary
   * that keeps that note out of every client-facing response. Any new
   * program_items column must be added here deliberately, not by
   * switching back to `*`. */
  async getActiveTreeForClient(clientId: string): Promise<ProgramTree | null> {
    const { data, error } = await this.db
      .from("programs")
      .select(
        `*, program_days(*, program_items(${CLIENT_SAFE_ITEM_COLUMNS}, exercises(id, name_ar, name_en, muscle_group, video_url, image_url, thumbnail_url, cues_ar, cues_en, steps_ar, steps_en, mistakes_ar, mistakes_en, safety_ar, safety_en, tempo, primary_muscles, secondary_muscles, measurement_type), program_item_sets(*)), program_activities(*)), rehab_protocols(*, rehab_phases(*)), diet_variants:diet_plans(id, name_ar, name_en, target_kcal, target_protein_g, target_carb_g, target_fat_g)`
      )
      .eq("client_id", clientId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .order("order_index", { referencedTable: "program_days" })
      .order("order_index", { referencedTable: "program_days.program_items" })
      .order("set_index", { referencedTable: "program_days.program_items.program_item_sets" })
      .order("order_index", { referencedTable: "program_days.program_activities" })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as ProgramTree | null;
  }

  async getTree(programId: string): Promise<ProgramTree | null> {
    const { data, error } = await this.db
      .from("programs")
      .select(
        `*, program_days(*, program_items(*, ${PRIVATE_NOTE_EMBED}, exercises(id, name_ar, name_en, muscle_group, equipment, video_url, image_url, thumbnail_url, cues_ar, cues_en, steps_ar, steps_en, mistakes_ar, mistakes_en, safety_ar, safety_en, tempo, primary_muscles, secondary_muscles, measurement_type), program_item_sets(*)), program_activities(*)), rehab_protocols(*, rehab_phases(*)), diet_variants:diet_plans(id, name_ar, name_en, target_kcal, target_protein_g, target_carb_g, target_fat_g)`
      )
      .eq("id", programId)
      .order("order_index", { referencedTable: "program_days" })
      .order("order_index", { referencedTable: "program_days.program_items" })
      .order("set_index", { referencedTable: "program_days.program_items.program_item_sets" })
      .order("order_index", { referencedTable: "program_days.program_activities" })
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const tree = data as unknown as { program_days: { program_items: WithPrivateNote[] }[] };
    for (const day of tree.program_days ?? []) day.program_items = day.program_items.map(withPrivateNote);
    return tree as unknown as ProgramTree;
  }

  /** Sets (or, when `note` is blank and `clearIfBlank`, removes) an item's
   * coach-only note. Lives in program_item_notes, whose policy only a coach
   * passes — see 20261114000004. */
  private async writePrivateNote(
    itemId: string,
    coachId: string,
    note: string | null | undefined,
    clearIfBlank: boolean
  ): Promise<void> {
    const text = note?.trim() ?? "";
    const notes = this.db.from("program_item_notes");
    if (!text) {
      if (!clearIfBlank) return;
      const { error } = await notes.delete().eq("program_item_id", itemId);
      if (error) throw error;
      return;
    }
    const { error } = await notes.upsert(
      { program_item_id: itemId, coach_id: coachId, note: text.slice(0, 1000), updated_at: new Date().toISOString() },
      { onConflict: "program_item_id" }
    );
    if (error) throw error;
  }

  async create(coachId: string, input: CreateProgramInput): Promise<Program> {
    if (input.client_id) await this.assertOwnClient(input.client_id);
    const { data, error } = await this.db
      .from("programs")
      .insert({ coach_id: coachId, client_id: input.client_id ?? null, ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async update(id: string, input: Partial<Omit<CreateProgramInput, "client_id">>): Promise<boolean> {
    const { data, error } = await this.db.from("programs").update(input).eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** Renames a program without touching its dates/schedule. RLS's coach_rw
   * UPDATE policy (20260731000008_plans.sql) already scopes this to the
   * owner coach; client_read_own is select-only, so a 0-row result means
   * "not yours" rather than "not found". */
  async renameProgram(
    id: string,
    input: { name_ar: string; name_en: string } & Pick<
      CreateProgramInput,
      "plan_type" | "goal" | "level" | "equipment"
    >
  ): Promise<boolean> {
    const { data, error } = await this.db.from("programs").update(input).eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** Sets (or, with null, clears) the program's authored week plan. */
  async setWeekPlan(id: string, plan: WeekPlan | null): Promise<boolean> {
    const { data, error } = await this.db
      .from("programs")
      .update({ week_plan: (plan && Object.keys(plan).length > 0 ? plan : null) as Json })
      .eq("id", id)
      .select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async remove(id: string): Promise<boolean> {
    const { data, error } = await this.db.from("programs").delete().eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** Deep-copies a whole program tree, retargeting every row's client_id.
   * `clientId` non-null assigns the copy to that client; null produces a
   * template. Three sequential inserts, no transaction (PostgREST has none)
   * — ponytail: a partial clone leaves an orphan program the coach can
   * delete; add an RPC if that ever bites.
   *
   * `source_template_id` is stamped only when cloning *out* to a client: a
   * template saved back from an assigned program has no source template. */
  private async cloneTree(
    programId: string,
    clientId: string | null,
    overrides: Partial<Pick<Program, "name_ar" | "name_en" | "start_date" | "end_date">> = {}
  ): Promise<Program | null> {
    const tree = await this.getTree(programId);
    if (!tree) return null;

    const { data: cloned, error: programError } = await this.db
      .from("programs")
      .insert({
        coach_id: tree.coach_id,
        client_id: clientId,
        name_ar: tree.name_ar,
        name_en: tree.name_en,
        start_date: tree.start_date,
        end_date: tree.end_date,
        schedule_mode: tree.schedule_mode,
        plan_type: tree.plan_type,
        goal: tree.goal,
        level: tree.level,
        equipment: tree.equipment,
        description_ar: tree.description_ar,
        description_en: tree.description_en,
        week_plan: tree.week_plan,
        source_template_id: clientId ? tree.id : null,
        ...overrides,
      })
      .select()
      .single();
    if (programError) throw programError;

    // Rehab protocols/phases are cloned before days so program_items can be
    // rewired to the CLONED phase id below, not the source one — a phase id
    // pointing at another program's row would be meaningless (and RLS would
    // just hide it since coach_id there wouldn't match the read scope).
    const phaseIdMap = new Map<string, string>();
    for (const protocol of tree.rehab_protocols) {
      const { data: clonedProtocol, error: protocolError } = await this.db
        .from("rehab_protocols")
        .insert({
          coach_id: tree.coach_id,
          client_id: clientId,
          program_id: cloned.id,
          body_area: protocol.body_area,
          injury_ar: protocol.injury_ar,
          injury_en: protocol.injury_en,
          restrictions_ar: protocol.restrictions_ar,
          restrictions_en: protocol.restrictions_en,
          instructions_ar: protocol.instructions_ar,
          instructions_en: protocol.instructions_en,
          order_index: protocol.order_index,
        })
        .select()
        .single();
      if (protocolError) throw protocolError;

      if (protocol.rehab_phases.length > 0) {
        const { data: clonedPhases, error: phasesError } = await this.db
          .from("rehab_phases")
          .insert(
            protocol.rehab_phases.map((phase) => ({
              coach_id: tree.coach_id,
              client_id: clientId,
              protocol_id: clonedProtocol.id,
              name_ar: phase.name_ar,
              name_en: phase.name_en,
              from_week: phase.from_week,
              to_week: phase.to_week,
              goals_ar: phase.goals_ar,
              goals_en: phase.goals_en,
              progression_criteria_ar: phase.progression_criteria_ar,
              progression_criteria_en: phase.progression_criteria_en,
              order_index: phase.order_index,
            }))
          )
          .select();
        if (phasesError) throw phasesError;
        protocol.rehab_phases.forEach((phase, i) => phaseIdMap.set(phase.id, clonedPhases[i].id));
      }
    }

    // Nutrition variants: cloned as program-owned diet_plans (program_id =
    // the CLONED program), independently of which days link to which — the
    // day→variant rewiring happens in the program_days loop below via
    // dietPlanIdMap. Delegated to DietPlansService.cloneTreeForProgram so
    // the meal/meal_item walk isn't duplicated here.
    const dietPlanIdMap = new Map<string, string>();
    const dietPlansService = new DietPlansService(this.db);
    for (const variant of tree.diet_variants) {
      const clonedVariant = await dietPlansService.cloneTreeForProgram(variant.id, clientId, cloned.id);
      if (clonedVariant) dietPlanIdMap.set(variant.id, clonedVariant.id);
    }

    // Parents before their sessions, so a session's parent already has its new id.
    const dayIdMap = new Map<string, string>();
    const daysParentsFirst = [...tree.program_days].sort(
      (a, b) => Number(a.parent_day_id != null) - Number(b.parent_day_id != null)
    );
    for (const day of daysParentsFirst) {
      const { data: clonedDay, error: dayError } = await this.db
        .from("program_days")
        .insert({
          coach_id: tree.coach_id,
          client_id: clientId,
          program_id: cloned.id,
          parent_day_id: day.parent_day_id ? (dayIdMap.get(day.parent_day_id) ?? null) : null,
          day_index: day.day_index,
          order_index: day.order_index,
          section_order: day.section_order,
          label_ar: day.label_ar,
          label_en: day.label_en,
          weekday: day.weekday,
          notes_ar: day.notes_ar,
          notes_en: day.notes_en,
          diet_plan_id: day.diet_plan_id ? (dietPlanIdMap.get(day.diet_plan_id) ?? null) : null,
        })
        .select()
        .single();
      if (dayError) throw dayError;
      dayIdMap.set(day.id, clonedDay.id);

      for (const item of day.program_items) {
        const { data: clonedItem, error: itemError } = await this.db
          .from("program_items")
          .insert({
            coach_id: tree.coach_id,
            client_id: clientId,
            program_day_id: clonedDay.id,
            exercise_id: item.exercise_id,
            sets: item.sets,
            reps: item.reps,
            rest_seconds: item.rest_seconds,
            progression_rule: item.progression_rule,
            notes_ar: item.notes_ar,
            notes_en: item.notes_en,
            order_index: item.order_index,
            block: item.block,
            rehab_phase_id: item.rehab_phase_id ? (phaseIdMap.get(item.rehab_phase_id) ?? null) : null,
            ...itemOptions(item),
            group_key: item.group_key,
            group_kind: item.group_kind,
            group_config: item.group_config,
          })
          .select()
          .single();
        if (itemError) throw itemError;
        await this.writePrivateNote(clonedItem.id, tree.coach_id, item.coach_note_private, false);

        // Per-set prescriptions must be cloned explicitly — they don't live
        // on program_items, so they're not carried by the insert above.
        if (item.program_item_sets.length > 0) {
          const { error: setsError } = await this.db.from("program_item_sets").insert(
            setCopyRows(item.program_item_sets, tree.coach_id, clientId, clonedItem.id)
          );
          if (setsError) throw setsError;
        }
      }

      if (day.program_activities.length > 0) {
        const { error: activitiesError } = await this.db.from("program_activities").insert(
          day.program_activities.map((activity) => ({
            coach_id: tree.coach_id,
            client_id: clientId,
            program_day_id: clonedDay.id,
            kind: activity.kind,
            modality: activity.modality,
            duration_min: activity.duration_min,
            distance_km: activity.distance_km,
            intensity: activity.intensity,
            hr_zone: activity.hr_zone,
            kcal_target: activity.kcal_target,
            pace: activity.pace,
            notes_ar: activity.notes_ar,
            notes_en: activity.notes_en,
            log_required: activity.log_required,
            order_index: activity.order_index,
          }))
        );
        if (activitiesError) throw activitiesError;
      }
    }

    return cloned;
  }

  /** Clones a template's whole tree onto a client, starting today — not the
   * template's own start_date, which is almost always in the past by the
   * time it's assigned and would otherwise throw off the cloned program's
   * calculated current week/day (program-cycle.ts). When `replaceActive` is
   * set, the client's other currently-active (non-archived) programs are
   * soft-archived right after, same as the coach's own "Delete" action —
   * restorable from Trash, never destroyed. */
  async cloneToClient(programId: string, clientId: string, replaceActive = false): Promise<Program | null> {
    await this.assertOwnClient(clientId);
    const today = new Date().toISOString().slice(0, 10);
    const cloned = await this.cloneTree(programId, clientId, { start_date: today });
    if (!cloned) return null;

    if (replaceActive) {
      const { error } = await this.db
        .from("programs")
        .update({ archived_at: new Date().toISOString() })
        .eq("client_id", clientId)
        .neq("id", cloned.id)
        .is("archived_at", null);
      if (error) throw error;
    }

    return cloned;
  }

  /** Brings one client's copy up to date with its template: a fresh clone of
   * the template's CURRENT tree replaces the client's program, keeping that
   * program's start and end dates so the client stays on the same week of the
   * plan. The old program is archived (restorable from Trash), never deleted,
   * so the client's logged history stays attached to it. Only the program it
   * replaces is archived — the client's other programs are left alone.
   * Null when the program is not visible, is a template, or was not cloned from
   * `templateId`. */
  async updateFromTemplate(templateId: string, clientProgramId: string): Promise<Program | null> {
    const { data: old, error } = await this.db
      .from("programs")
      .select("id, client_id, start_date, end_date, source_template_id")
      .eq("id", clientProgramId)
      .maybeSingle();
    if (error) throw error;
    if (!old || !old.client_id || old.source_template_id !== templateId) return null;

    await this.assertOwnClient(old.client_id);
    const cloned = await this.cloneTree(templateId, old.client_id, {
      start_date: old.start_date,
      end_date: old.end_date,
    });
    if (!cloned) return null;

    const { error: archiveError } = await this.db
      .from("programs")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", old.id);
    if (archiveError) throw archiveError;
    return cloned;
  }

  /** The reverse of cloneToClient: copies an assigned program back out as a
   * reusable template. `end_date` is dropped — a template's dates are
   * placeholders that cloneToClient overwrites on assignment anyway, and
   * carrying a past end date forward is noise. `start_date` is not null, so
   * it rides along. */
  async saveAsTemplate(programId: string, name_ar?: string, name_en?: string): Promise<Program | null> {
    return this.cloneTree(programId, null, {
      end_date: null,
      ...(name_ar ? { name_ar } : {}),
      ...(name_en ? { name_en } : {}),
    });
  }

  /** Derives coach_id/client_id from the parent `programs` row (RLS-scoped
   * read) rather than from any argument — see class doc. Returns null,
   * inserting nothing, when the program isn't visible. */
  async addDay(programId: string, input: CreateDayInput): Promise<ProgramDay | null> {
    const { data: parent, error: parentError } = await this.db
      .from("programs")
      .select("coach_id, client_id")
      .eq("id", programId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (!parent) return null;

    const { data, error } = await this.db
      .from("program_days")
      .insert({ coach_id: parent.coach_id, client_id: parent.client_id, program_id: programId, ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Adds an extra session (AM/PM split) to a day: a program_day that points at
   * `parentDayId` and shares its day_index, so the calendar logic — which only
   * looks at days without a parent — never sees it. The parent must itself be a
   * calendar day (sessions do not nest). Same parent-derivation rule as addDay:
   * coach_id/client_id/program_id come from the RLS-scoped parent row. Null when
   * the parent is not visible; throws `session_parent_invalid` for a nested one. */
  async addSession(
    parentDayId: string,
    input: { label_ar?: string; label_en?: string; notes_ar?: string; notes_en?: string }
  ): Promise<ProgramDay | null> {
    const { data: parent, error: parentError } = await this.db
      .from("program_days")
      .select("coach_id, client_id, program_id, day_index, parent_day_id")
      .eq("id", parentDayId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (!parent) return null;
    if (parent.parent_day_id) throw new Error("session_parent_invalid");

    // After the parent's existing sessions.
    const { data: last, error: lastError } = await this.db
      .from("program_days")
      .select("order_index")
      .eq("parent_day_id", parentDayId)
      .order("order_index", { ascending: false })
      .limit(1);
    if (lastError) throw lastError;

    const { data, error } = await this.db
      .from("program_days")
      .insert({
        coach_id: parent.coach_id,
        client_id: parent.client_id,
        program_id: parent.program_id,
        parent_day_id: parentDayId,
        day_index: parent.day_index,
        order_index: (last?.[0]?.order_index ?? -1) + 1,
        ...input,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateDay(dayId: string, input: UpdateDayInput): Promise<boolean> {
    const { data, error } = await this.db.from("program_days").update(input).eq("id", dayId).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async removeDay(dayId: string): Promise<boolean> {
    const { data, error } = await this.db.from("program_days").delete().eq("id", dayId).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** Same derivation, one level deeper — parent is `program_days`. Writes
   * both the real per-set rows and a legacy sets/reps/rest_seconds snapshot
   * on program_items itself (min-max reps range, first set's rest) purely
   * as insurance for any not-yet-migrated reader — see class doc for the
   * derivation rule this follows. */
  async addItem(dayId: string, input: CreateItemInput): Promise<ProgramItem | null> {
    const { data: parent, error: parentError } = await this.db
      .from("program_days")
      .select("coach_id, client_id")
      .eq("id", dayId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (!parent) return null;

    const sets = input.sets && input.sets.length > 0 ? input.sets : [{ reps: 10 }];

    // New items go to the end of the day. Without this every insert got the
    // column default (0), so a day's order was a pile of ties.
    const { data: last, error: lastError } = await this.db
      .from("program_items")
      .select("order_index")
      .eq("program_day_id", dayId)
      .order("order_index", { ascending: false })
      .limit(1);
    if (lastError) throw lastError;

    const { data, error } = await this.db
      .from("program_items")
      .insert({
        coach_id: parent.coach_id,
        client_id: parent.client_id,
        program_day_id: dayId,
        order_index: (last?.[0]?.order_index ?? -1) + 1,
        exercise_id: input.exercise_id,
        ...legacySnapshot(sets),
        progression_rule: input.progression_rule ?? "none",
        notes_ar: input.notes_ar,
        notes_en: input.notes_en,
        block: input.block ?? "main",
        rehab_phase_id: input.rehab_phase_id ?? null,
        tempo: input.tempo || null,
        per_side: input.per_side ?? false,
        scaled_notes_ar: input.scaled_notes_ar || null,
        scaled_notes_en: input.scaled_notes_en || null,
      })
      .select()
      .single();
    if (error) throw error;

    const { error: setsError } = await this.db
      .from("program_item_sets")
      .insert(setRows(sets, parent.coach_id, parent.client_id, data.id));
    if (setsError) throw setsError;
    await this.writePrivateNote(data.id, parent.coach_id, input.coach_note_private, false);

    return data;
  }

  /** Updates an item's fields, its coach-only note, and (when `sets` is given)
   * replaces its sets. The sets and the legacy sets/reps snapshot are replaced
   * in ONE transaction by replace_program_item_sets, so a failure can no longer
   * leave the item without sets. False = RLS hid the item. */
  async updateItem(itemId: string, input: UpdateItemInput): Promise<boolean> {
    const { sets, coach_note_private, ...itemFields } = input;
    const patch: Database["public"]["Tables"]["program_items"]["Update"] = { ...itemFields };
    // The form sends "" for a cleared text field; the column wants null.
    for (const key of ["tempo", "scaled_notes_ar", "scaled_notes_en"] as const) {
      if (key in itemFields) patch[key] = itemFields[key] || null;
    }

    let coachId: string | null = null;
    if (Object.keys(patch).length > 0) {
      const { data, error } = await this.db.from("program_items").update(patch).eq("id", itemId).select("id, coach_id");
      if (error) throw error;
      if (data.length === 0) return false;
      coachId = data[0].coach_id;
    }

    if (sets) {
      const { data: replaced, error: rpcError } = await this.db.rpc("replace_program_item_sets", {
        p_item_id: itemId,
        p_sets: setPayloads(sets) as unknown as Json,
        p_legacy: legacySnapshot(sets),
      });
      if (rpcError) throw rpcError;
      if (!replaced) return false;
    }

    if (coach_note_private !== undefined) {
      if (coachId == null) {
        const { data, error } = await this.db.from("program_items").select("coach_id").eq("id", itemId).maybeSingle();
        if (error) throw error;
        if (!data) return false;
        coachId = data.coach_id;
      }
      await this.writePrivateNote(itemId, coachId, coach_note_private, true);
    }
    return true;
  }

  async removeItem(itemId: string): Promise<boolean> {
    const { data, error } = await this.db.from("program_items").delete().eq("id", itemId).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** Copies one item (its prescription, per-set data, block, and private
   * note — everything except group_key/group_kind, since a duplicate isn't
   * automatically part of its source's superset/circuit) onto the end of
   * the same day. Re-reads the source row rather than trusting a
   * caller-supplied copy, same parent-derivation rule as every other write
   * here — an itemId the caller can't see yields null, nothing inserted. */
  async duplicateItem(itemId: string): Promise<ProgramItem | null> {
    const { data: source, error: sourceError } = await this.db
      .from("program_items")
      .select(`*, ${PRIVATE_NOTE_EMBED}, program_item_sets(*)`)
      .eq("id", itemId)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) return null;
    const sourceNote = withPrivateNote(source as unknown as WithPrivateNote).coach_note_private;

    const { data: siblings, error: siblingsError } = await this.db
      .from("program_items")
      .select("order_index")
      .eq("program_day_id", source.program_day_id)
      .order("order_index", { ascending: false })
      .limit(1);
    if (siblingsError) throw siblingsError;
    const nextOrderIndex = (siblings[0]?.order_index ?? -1) + 1;

    const { data: newItem, error: itemError } = await this.db
      .from("program_items")
      .insert({
        coach_id: source.coach_id,
        client_id: source.client_id,
        program_day_id: source.program_day_id,
        exercise_id: source.exercise_id,
        sets: source.sets,
        reps: source.reps,
        rest_seconds: source.rest_seconds,
        progression_rule: source.progression_rule,
        notes_ar: source.notes_ar,
        notes_en: source.notes_en,
        order_index: nextOrderIndex,
        block: source.block,
        rehab_phase_id: source.rehab_phase_id,
        ...itemOptions(source),
      })
      .select()
      .single();
    if (itemError) throw itemError;
    await this.writePrivateNote(newItem.id, source.coach_id, sourceNote, false);

    const sourceSets = (source.program_item_sets as ProgramItemSet[]).sort((a, b) => a.set_index - b.set_index);
    if (sourceSets.length > 0) {
      const { error: setsError } = await this.db.from("program_item_sets").insert(
        setCopyRows(sourceSets, source.coach_id, source.client_id, newItem.id)
      );
      if (setsError) throw setsError;
    }

    return newItem;
  }

  /** Copies a whole day (label, weekday, and every item + its sets) onto
   * the end of the same program at the next free day_index. Grouped items
   * keep their relative order but NOT their group_key — duplicating a day
   * that contains a superset produces ungrouped copies, since carrying the
   * exact group_key forward would silently merge the new day's "superset"
   * with the original day's, which are meant to be independent. A coach
   * who wants the duplicate grouped too re-groups it in two taps (the
   * builder's existing multi-select -> Make superset flow). */
  async duplicateDay(dayId: string): Promise<ProgramDay | null> {
    const { data: source, error: sourceError } = await this.db
      .from("program_days")
      .select(`*, program_items(*, ${PRIVATE_NOTE_EMBED}, program_item_sets(*)), program_activities(*)`)
      .eq("id", dayId)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) return null;
    // An extra session belongs to its day; duplicating one is not offered, and a
    // copy would land on the calendar as a day of its own.
    if (source.parent_day_id) return null;

    const { data: siblingDays, error: siblingDaysError } = await this.db
      .from("program_days")
      .select("day_index, order_index")
      .eq("program_id", source.program_id)
      .order("day_index", { ascending: false })
      .limit(1);
    if (siblingDaysError) throw siblingDaysError;
    const nextDayIndex = (siblingDays[0]?.day_index ?? 0) + 1;
    const nextOrderIndex = (siblingDays[0]?.order_index ?? -1) + 1;

    const { data: newDay, error: dayError } = await this.db
      .from("program_days")
      .insert({
        coach_id: source.coach_id,
        client_id: source.client_id,
        program_id: source.program_id,
        day_index: nextDayIndex,
        order_index: nextOrderIndex,
        section_order: source.section_order,
        label_ar: source.label_ar,
        label_en: source.label_en,
        weekday: source.weekday,
        notes_ar: source.notes_ar,
        notes_en: source.notes_en,
        diet_plan_id: source.diet_plan_id,
      })
      .select()
      .single();
    if (dayError) throw dayError;

    const sourceItems = (
      (source.program_items as unknown as (ProgramItem & WithPrivateNote & { program_item_sets: ProgramItemSet[] })[]).map(
        withPrivateNote
      ) as (ProgramItem & { coach_note_private: string | null; program_item_sets: ProgramItemSet[] })[]
    ).sort((a, b) => a.order_index - b.order_index);

    for (const item of sourceItems) {
      const { data: newItem, error: itemError } = await this.db
        .from("program_items")
        .insert({
          coach_id: source.coach_id,
          client_id: source.client_id,
          program_day_id: newDay.id,
          exercise_id: item.exercise_id,
          sets: item.sets,
          reps: item.reps,
          rest_seconds: item.rest_seconds,
          progression_rule: item.progression_rule,
          notes_ar: item.notes_ar,
          notes_en: item.notes_en,
          order_index: item.order_index,
          block: item.block,
          rehab_phase_id: item.rehab_phase_id,
          ...itemOptions(item),
        })
        .select()
        .single();
      if (itemError) throw itemError;
      await this.writePrivateNote(newItem.id, source.coach_id, item.coach_note_private, false);

      const sourceSets = item.program_item_sets.sort((a, b) => a.set_index - b.set_index);
      if (sourceSets.length > 0) {
        const { error: setsError } = await this.db.from("program_item_sets").insert(
          setCopyRows(sourceSets, source.coach_id, source.client_id, newItem.id)
        );
        if (setsError) throw setsError;
      }
    }

    const sourceActivities = (source.program_activities as ProgramActivity[]).sort(
      (a, b) => a.order_index - b.order_index
    );
    if (sourceActivities.length > 0) {
      const { error: activitiesError } = await this.db.from("program_activities").insert(
        sourceActivities.map((activity) => ({
          coach_id: source.coach_id,
          client_id: source.client_id,
          program_day_id: newDay.id,
          kind: activity.kind,
          modality: activity.modality,
          duration_min: activity.duration_min,
          distance_km: activity.distance_km,
          intensity: activity.intensity,
          hr_zone: activity.hr_zone,
          kcal_target: activity.kcal_target,
          pace: activity.pace,
          notes_ar: activity.notes_ar,
          notes_en: activity.notes_en,
          log_required: activity.log_required,
          order_index: activity.order_index,
        }))
      );
      if (activitiesError) throw activitiesError;
    }

    return newDay;
  }

  /** Swaps an item's exercise while keeping every other field (sets,
   * progression, notes, block, private note) — "replace exercise" in the
   * builder, distinct from swapping mid-session (workouts.service.ts's
   * substituted_exercise_id, which never touches the prescription). */
  async replaceItemExercise(itemId: string, exerciseId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("program_items")
      .update({ exercise_id: exerciseId })
      .eq("id", itemId)
      .select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** Persists the section order of one day. Sections are derived from item
   * data (see day-sections.ts), so the write is just the ordered key array on
   * program_days. normalizeSectionOrder appends any known section missing from
   * the caller's list, which is how a newly meaningful section lands at the
   * end rather than being dropped. Returns the number of rows actually
   * updated (0 = RLS hid the day, i.e. not this coach's program). */
  async reorderSections(dayId: string, ordered: readonly string[]): Promise<number> {
    const { data, error } = await this.db
      .from("program_days")
      .update({ section_order: normalizeSectionOrder(ordered) })
      .eq("id", dayId)
      .select("id");
    if (error) throw error;
    return data.length;
  }

  /** N scoped updates, not an upsert — a PostgREST upsert needs every NOT
   * NULL column and would null out coach_id/label. ponytail: N updates per
   * drag, N < 20 (a day's item count). Batch RPC if that ever grows. */
  async reorderDays(programId: string, orderedIds: string[]): Promise<number> {
    let count = 0;
    for (let i = 0; i < orderedIds.length; i++) {
      const { data, error } = await this.db
        .from("program_days")
        .update({ day_index: i + 1, order_index: i })
        .eq("id", orderedIds[i])
        .eq("program_id", programId)
        .select("id");
      if (error) throw error;
      count += data.length;
    }
    return count;
  }

  /** Rejects (throws) a reorder that would split a superset/circuit's
   * members apart — the session flow assumes a group's items are
   * contiguous to expand them into one round-robin block (see
   * session-order.ts), so an interleaved group would silently break that.
   * The builder is expected to keep grouped items draggable only as a
   * unit; this is the server-side backstop for whatever gets sent anyway. */
  async reorderItems(dayId: string, orderedIds: string[]): Promise<number> {
    const { data: items, error: fetchError } = await this.db
      .from("program_items")
      .select("id, group_key")
      .eq("program_day_id", dayId)
      .in("id", orderedIds);
    if (fetchError) throw fetchError;

    const groupById = new Map(items.map((i) => [i.id, i.group_key]));
    const seenGroups = new Set<string>();
    let lastGroup: string | null = null;
    for (const id of orderedIds) {
      const group = groupById.get(id) ?? null;
      if (group !== lastGroup) {
        if (group != null && seenGroups.has(group)) {
          throw new Error("group_not_contiguous");
        }
        if (group != null) seenGroups.add(group);
      }
      lastGroup = group;
    }

    let count = 0;
    for (let i = 0; i < orderedIds.length; i++) {
      const { data, error } = await this.db
        .from("program_items")
        .update({ order_index: i })
        .eq("id", orderedIds[i])
        .eq("program_day_id", dayId)
        .select("id");
      if (error) throw error;
      count += data.length;
    }
    return count;
  }

  /** Scales prescribed weight down on every given item's sets — the
   * program-side effect of a review's "reduce load" adjustment (see
   * review.service.ts's StructuredAdjustment). Bodyweight sets (weight null)
   * are left alone: there's nothing to reduce. Same N-updates tradeoff as
   * reorderDays/reorderItems above — RLS already scopes program_item_sets to
   * the coach, so no separate ownership check is needed here. */
  async applyLoadReduction(itemIds: string[], percent: number): Promise<number> {
    const { data: sets, error: fetchError } = await this.db
      .from("program_item_sets")
      .select("id, weight")
      .in("program_item_id", itemIds);
    if (fetchError) throw fetchError;

    let count = 0;
    for (const set of sets ?? []) {
      if (set.weight == null) continue;
      const nextWeight = Math.round(set.weight * (1 - percent / 100) * 2) / 2; // nearest 0.5kg
      const { error } = await this.db.from("program_item_sets").update({ weight: nextWeight }).eq("id", set.id);
      if (error) throw error;
      count++;
    }
    return count;
  }

  /** Groups the given items into a superset / circuit / timed group — they
   * render together in the builder and, in the session, run as one block
   * (round-robin for the untimed kinds, on a clock for the timed ones). The
   * group key is generated here (crypto.randomUUID) rather than accepted from
   * the caller, so a client can't force a collision with an existing group.
   * Requires at least 2 items.
   *
   * The session flow assumes a group's members are consecutive, so this
   * enforces it at the source instead of leaving it for a later drag to trip
   * over: the items must all be on one day and must not split an existing
   * group (select all of its members or none), and if they are not already
   * adjacent they are gathered at the position of the first selected one.
   * The day's order is rewritten as 0..n-1 while doing so, which also clears
   * any order_index ties left by older inserts. Throws `group_selection_invalid`
   * for a selection that breaks those rules. */
  async groupItems(itemIds: string[], kind: GroupKind, config: GroupConfig | null = null): Promise<number> {
    const ids = [...new Set(itemIds)];
    if (ids.length < 2) return 0;

    const { data: picked, error: pickedError } = await this.db
      .from("program_items")
      .select("id, program_day_id, group_key")
      .in("id", ids);
    if (pickedError) throw pickedError;
    const dayIds = new Set((picked ?? []).map((i) => i.program_day_id));
    if ((picked ?? []).length !== ids.length || dayIds.size !== 1) throw new Error("group_selection_invalid");
    const dayId = [...dayIds][0];

    const { data: dayItems, error: dayError } = await this.db
      .from("program_items")
      .select("id, group_key, order_index")
      .eq("program_day_id", dayId)
      .order("order_index")
      .order("id");
    if (dayError) throw dayError;

    const order = planGroupOrder(dayItems ?? [], ids);
    if (!order) throw new Error("group_selection_invalid");

    // Persist the (possibly changed) order. Only rows whose index differs.
    const currentIndex = new Map((dayItems ?? []).map((i) => [i.id, i.order_index]));
    for (let i = 0; i < order.length; i++) {
      if (currentIndex.get(order[i]) === i) continue;
      const { error } = await this.db.from("program_items").update({ order_index: i }).eq("id", order[i]).eq("program_day_id", dayId);
      if (error) throw error;
    }

    const groupKey = crypto.randomUUID();
    const { data, error } = await this.db
      .from("program_items")
      .update({ group_key: groupKey, group_kind: kind, group_config: (config ?? null) as Json })
      .in("id", ids)
      .select("id");
    if (error) throw error;
    return data.length;
  }

  /** Changes the format of an EXISTING group (e.g. superset → AMRAP, or a new
   * time cap). `itemIds` are every member of the group — the config is stored
   * identically on all of them (see group_config in the migration), so it is
   * written to all in one update. group_key is untouched. */
  async setGroupFormat(itemIds: string[], kind: GroupKind, config: GroupConfig | null): Promise<number> {
    if (itemIds.length === 0) return 0;
    const { data, error } = await this.db
      .from("program_items")
      .update({ group_kind: kind, group_config: (config ?? null) as Json })
      .in("id", itemIds)
      .not("group_key", "is", null)
      .select("id");
    if (error) throw error;
    return data.length;
  }

  async ungroupItems(itemIds: string[]): Promise<number> {
    const { data, error } = await this.db
      .from("program_items")
      .update({ group_key: null, group_kind: null, group_config: null })
      .in("id", itemIds)
      .select("id");
    if (error) throw error;
    return data.length;
  }

  /** Every client instance cloned from this template, for the template
   * detail page's "assigned to N clients" list. */
  async listClonedInstances(templateId: string) {
    const { data, error } = await this.db
      .from("programs")
      .select("*, clients(display_name)")
      .eq("source_template_id", templateId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  /** Snapshots an ASSIGNED program's current tree before a structural edit
   * — call this from an action, once per user gesture, before the mutation
   * it's about to apply. Templates (client_id null) are skipped entirely:
   * they're edited freely pre-clone, so snapshotting every template tweak
   * would be noise with no real undo value (see the migration's header
   * comment). No-op (returns null, snapshots nothing) for a template or an
   * invisible/nonexistent program — the caller doesn't need to branch on
   * "assigned vs template" itself. Returns the new revision's id (rather
   * than a bare boolean) so a caller that needs to LINK the snapshot to
   * something else — applyAdjustmentAction linking it to a
   * coaching_decisions row, see ledger.service.ts's markApplied — doesn't
   * have to re-fetch it; existing callers that only checked truthiness or
   * ignored the result keep working unchanged against a string | null. */
  async snapshotIfAssigned(programId: string, reason?: string): Promise<string | null> {
    const tree = await this.getTree(programId);
    if (!tree || tree.client_id == null) return null;

    const { data, error } = await this.db
      .from("program_revisions")
      .insert({
        coach_id: tree.coach_id,
        program_id: programId,
        snapshot: tree as unknown as Database["public"]["Tables"]["program_revisions"]["Insert"]["snapshot"],
        reason,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  async listRevisions(programId: string, limit = 20) {
    const { data, error } = await this.db
      .from("program_revisions")
      .select("id, reason, created_at")
      .eq("program_id", programId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  /** Restores a program to a prior snapshot IN PLACE: every day, item and
   * activity in the snapshot is upserted under its original id, and only rows
   * that did not exist at snapshot time are deleted.
   *
   * It must not clear-and-reinsert: workout_sessions and workout_set_logs
   * reference program_days / program_items with ON DELETE CASCADE, so deleting
   * the tree would silently erase the client's logged history. Keeping ids
   * keeps those logs attached. (Items the coach added after the snapshot are
   * still deleted, and their logs go with them — that is the restore.)
   *
   * Not itself snapshotted first: the caller should call snapshotIfAssigned
   * before this if "undo the restore" needs to be possible (the builder's
   * restore action does). No transaction (PostgREST has none): a failure
   * part-way leaves the program partly restored, and re-running the restore is
   * safe because every write is an upsert by id. Rehab protocols/phases and
   * nutrition variants are not part of what is restored. */
  async restoreRevision(revisionId: string): Promise<boolean> {
    const { data: revision, error: revisionError } = await this.db
      .from("program_revisions")
      .select("program_id, snapshot")
      .eq("id", revisionId)
      .maybeSingle();
    if (revisionError) throw revisionError;
    if (!revision) return false;

    const snapshot = revision.snapshot as unknown as ProgramTree;

    // A phase or diet plan referenced by the snapshot may have been deleted
    // since (their FKs are ON DELETE SET NULL); writing the stale id back would
    // violate the FK, so a vanished reference restores as null.
    const livePhases = await this.existingIds(
      "rehab_phases",
      snapshot.program_days.flatMap((d) => d.program_items.map((i) => i.rehab_phase_id))
    );
    const liveDiets = await this.existingIds(
      "diet_plans",
      snapshot.program_days.map((d) => d.diet_plan_id)
    );

    // A session's parent row must exist before the session is upserted.
    const daysParentsFirst = [...snapshot.program_days].sort(
      (a, b) => Number(a.parent_day_id != null) - Number(b.parent_day_id != null)
    );
    for (const day of daysParentsFirst) {
      const { error: dayError } = await this.db.from("program_days").upsert(
        {
          id: day.id,
          coach_id: snapshot.coach_id,
          client_id: snapshot.client_id,
          program_id: revision.program_id,
          parent_day_id: day.parent_day_id ?? null,
          day_index: day.day_index,
          order_index: day.order_index,
          section_order: day.section_order,
          label_ar: day.label_ar,
          label_en: day.label_en,
          weekday: day.weekday,
          notes_ar: day.notes_ar,
          notes_en: day.notes_en,
          diet_plan_id: day.diet_plan_id && liveDiets.has(day.diet_plan_id) ? day.diet_plan_id : null,
        },
        { onConflict: "id" }
      );
      if (dayError) throw dayError;

      for (const item of day.program_items) {
        const { error: itemError } = await this.db.from("program_items").upsert(
          {
            id: item.id,
            coach_id: snapshot.coach_id,
            client_id: snapshot.client_id,
            program_day_id: day.id,
            exercise_id: item.exercise_id,
            sets: item.sets,
            reps: item.reps,
            rest_seconds: item.rest_seconds,
            progression_rule: item.progression_rule,
            notes_ar: item.notes_ar,
            notes_en: item.notes_en,
            order_index: item.order_index,
            block: item.block,
            rehab_phase_id: item.rehab_phase_id && livePhases.has(item.rehab_phase_id) ? item.rehab_phase_id : null,
            ...itemOptions(item),
            group_key: item.group_key,
            group_kind: item.group_kind,
            group_config: item.group_config,
          },
          { onConflict: "id" }
        );
        if (itemError) throw itemError;
        await this.writePrivateNote(item.id, snapshot.coach_id, item.coach_note_private, true);

        // Nothing references a set's own id (logs point at the item), so the
        // item's sets are simply replaced.
        const { error: clearError } = await this.db.from("program_item_sets").delete().eq("program_item_id", item.id);
        if (clearError) throw clearError;
        if (item.program_item_sets.length > 0) {
          const { error: setsError } = await this.db
            .from("program_item_sets")
            .insert(setCopyRows(item.program_item_sets, snapshot.coach_id, snapshot.client_id, item.id));
          if (setsError) throw setsError;
        }
      }

      for (const activity of day.program_activities) {
        const { error: activityError } = await this.db.from("program_activities").upsert(
          {
            id: activity.id,
            coach_id: snapshot.coach_id,
            client_id: snapshot.client_id,
            program_day_id: day.id,
            kind: activity.kind,
            modality: activity.modality,
            duration_min: activity.duration_min,
            distance_km: activity.distance_km,
            intensity: activity.intensity,
            hr_zone: activity.hr_zone,
            kcal_target: activity.kcal_target,
            pace: activity.pace,
            notes_ar: activity.notes_ar,
            notes_en: activity.notes_en,
            log_required: activity.log_required,
            order_index: activity.order_index,
          },
          { onConflict: "id" }
        );
        if (activityError) throw activityError;
      }

      // Items / activities added to this day after the snapshot.
      await this.deleteExcept("program_items", "program_day_id", day.id, day.program_items.map((i) => i.id));
      await this.deleteExcept("program_activities", "program_day_id", day.id, day.program_activities.map((a) => a.id));
    }

    // Days added after the snapshot — last, so an item that moved off such a
    // day was already upserted onto its snapshot day and survives the cascade.
    await this.deleteExcept("program_days", "program_id", revision.program_id, snapshot.program_days.map((d) => d.id));

    return true;
  }

  /** The subset of `ids` that still exist in `table` (RLS-scoped). */
  private async existingIds(table: "rehab_phases" | "diet_plans", ids: (string | null)[]): Promise<Set<string>> {
    const wanted = [...new Set(ids.filter((id): id is string => id != null))];
    if (wanted.length === 0) return new Set();
    const { data, error } = await this.db.from(table).select("id").in("id", wanted);
    if (error) throw error;
    return new Set((data ?? []).map((r) => r.id));
  }

  /** Deletes every row of `table` under one parent except the kept ids. */
  private async deleteExcept(
    table: "program_days" | "program_items" | "program_activities",
    parentColumn: "program_id" | "program_day_id",
    parentId: string,
    keepIds: string[]
  ): Promise<void> {
    // The three tables have different parent columns; the dynamic column name
    // is checked by the literal union above, which supabase-js's typing cannot
    // follow through a runtime string.
    let query = (this.db.from(table) as unknown as {
      delete: () => { eq: (c: string, v: string) => DeleteFilter };
    })
      .delete()
      .eq(parentColumn, parentId);
    if (keepIds.length > 0) query = query.not("id", "in", `(${keepIds.join(",")})`);
    const { error } = await query;
    if (error) throw error;
  }

  // ---------------------------------------------------------------------
  // Cardio/recovery activities — same parent-derivation rule as addItem:
  // coach_id/client_id always come from the RLS-scoped parent program_days
  // row, never a caller argument.
  // ---------------------------------------------------------------------

  async addActivity(dayId: string, input: CreateActivityInput): Promise<ProgramActivity | null> {
    const { data: parent, error: parentError } = await this.db
      .from("program_days")
      .select("coach_id, client_id")
      .eq("id", dayId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (!parent) return null;

    const { data, error } = await this.db
      .from("program_activities")
      .insert({ coach_id: parent.coach_id, client_id: parent.client_id, program_day_id: dayId, ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateActivity(activityId: string, input: UpdateActivityInput): Promise<boolean> {
    const { data, error } = await this.db
      .from("program_activities")
      .update(input)
      .eq("id", activityId)
      .select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async removeActivity(activityId: string): Promise<boolean> {
    const { data, error } = await this.db.from("program_activities").delete().eq("id", activityId).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** Copies one activity (a cardio/recovery entry a coach built once, e.g.
   * "20min LISS") onto several other days of the same program — the
   * builder's "also add to Mon/Wed/Fri" flow, so a coach doesn't rebuild
   * the same cardio prescription by hand on every day it repeats. Re-reads
   * the source (RLS-scoped) rather than trusting a caller-supplied copy,
   * and re-derives each target day's own coach_id/client_id the same way
   * every other write in this service does — a dayId the caller can't see
   * is silently skipped, not an error, since this is a best-effort batch. */
  async copyActivityToDays(activityId: string, dayIds: string[]): Promise<number> {
    const { data: source, error: sourceError } = await this.db
      .from("program_activities")
      .select("*")
      .eq("id", activityId)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) return 0;

    const { data: days, error: daysError } = await this.db
      .from("program_days")
      .select("id, coach_id, client_id")
      .in("id", dayIds);
    if (daysError) throw daysError;
    if (!days || days.length === 0) return 0;

    const { data, error } = await this.db.from("program_activities").insert(
      days.map((day) => ({
        coach_id: day.coach_id,
        client_id: day.client_id,
        program_day_id: day.id,
        kind: source.kind,
        modality: source.modality,
        duration_min: source.duration_min,
        distance_km: source.distance_km,
        intensity: source.intensity,
        hr_zone: source.hr_zone,
        kcal_target: source.kcal_target,
        pace: source.pace,
        notes_ar: source.notes_ar,
        notes_en: source.notes_en,
        log_required: source.log_required,
        order_index: source.order_index,
      }))
    ).select("id");
    if (error) throw error;
    return data.length;
  }

  async reorderActivities(dayId: string, orderedIds: string[]): Promise<number> {
    let count = 0;
    for (let i = 0; i < orderedIds.length; i++) {
      const { data, error } = await this.db
        .from("program_activities")
        .update({ order_index: i })
        .eq("id", orderedIds[i])
        .eq("program_day_id", dayId)
        .select("id");
      if (error) throw error;
      count += data.length;
    }
    return count;
  }

  // ---------------------------------------------------------------------
  // Nutrition day-links — assigning/overriding which diet_plans variant a
  // day shows. The variant itself is created/edited via DietPlansService
  // (createForProgram/customizeForDay); this only manages the day's link.
  // ---------------------------------------------------------------------

  /** Points one or more days at a nutrition variant — the assignment
   * grid's click. Validates the variant belongs to THIS program first (a
   * coach picking from the program's own variant list can't be tricked
   * into linking another program's plan id), and re-derives each day's
   * scope from its own row rather than trusting the caller, same rule as
   * copyActivityToDays. Passing dietPlanId null unlinks the given days. */
  async setDayNutrition(programId: string, dayIds: string[], dietPlanId: string | null): Promise<number> {
    if (dietPlanId) {
      const { data: variant, error: variantError } = await this.db
        .from("diet_plans")
        .select("id")
        .eq("id", dietPlanId)
        .eq("program_id", programId)
        .maybeSingle();
      if (variantError) throw variantError;
      if (!variant) throw new Error("diet_plan_not_in_program");
    }

    const { data, error } = await this.db
      .from("program_days")
      .update({ diet_plan_id: dietPlanId })
      .eq("program_id", programId)
      .in("id", dayIds)
      .select("id");
    if (error) throw error;
    return data.length;
  }
}
