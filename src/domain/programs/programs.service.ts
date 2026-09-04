import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ProgressionRule } from "./progression";

type Program = Database["public"]["Tables"]["programs"]["Row"];
type ProgramDay = Database["public"]["Tables"]["program_days"]["Row"];
type ProgramItem = Database["public"]["Tables"]["program_items"]["Row"];
type ProgramItemSet = Database["public"]["Tables"]["program_item_sets"]["Row"];
type Exercise = Database["public"]["Tables"]["exercises"]["Row"];

export type ProgramScope = "all" | "assigned" | "templates";

export type CreateProgramInput = {
  client_id?: string | null;
  name_ar: string;
  name_en: string;
  start_date?: string;
  end_date?: string | null;
  schedule_mode?: "cycle" | "weekly";
};

export type CreateDayInput = { day_index: number; label_ar?: string; label_en?: string; weekday?: number | null };
export type UpdateDayInput = Partial<CreateDayInput>;

/** One prescribed set — the week-1 base that `progression.ts` projects onto
 * weeks 2-12. `weight: null` means bodyweight/unloaded. */
export type SetInput = { reps: number; weight?: number | null; rest_seconds?: number | null };

export type CreateItemInput = {
  exercise_id: string;
  sets?: SetInput[];
  progression_rule?: ProgressionRule;
  notes_ar?: string;
  notes_en?: string;
};
export type UpdateItemInput = Partial<CreateItemInput>;

export type ProgramTree = Program & {
  program_days: (ProgramDay & {
    program_items: (ProgramItem & {
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
      >;
      program_item_sets: ProgramItemSet[];
    })[];
  })[];
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
 * real per-set data (item.sets/item.reps) still sees something sane. */
function legacySnapshot(sets: SetInput[]) {
  const reps = sets.map((s) => s.reps);
  const min = Math.min(...reps);
  const max = Math.max(...reps);
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
    reps: set.reps,
    weight: set.weight ?? null,
    rest_seconds: set.rest_seconds ?? null,
  }));
}

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

  async list(scope: ProgramScope = "all") {
    let q = this.db
      .from("programs")
      .select("*, clients(display_name)")
      .order("created_at", { ascending: false });
    q = applyScope(q, scope);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  /** The client's current assigned (non-template) program, if any — a
   * client can have at most one active program in practice, so this just
   * takes the most recently created one rather than modeling an explicit
   * "active" flag that doesn't exist in the schema. Used by the client
   * app's Today/Plan tabs, which need the tree to compute day_index ->
   * date via program-cycle.ts. */
  async getActiveTreeForClient(clientId: string): Promise<ProgramTree | null> {
    const { data, error } = await this.db
      .from("programs")
      .select(
        "*, program_days(*, program_items(*, exercises(id, name_ar, name_en, muscle_group, video_url, cues_ar, cues_en, steps_ar, steps_en, mistakes_ar, mistakes_en, safety_ar, safety_en, tempo), program_item_sets(*)))"
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .order("order_index", { referencedTable: "program_days" })
      .order("order_index", { referencedTable: "program_days.program_items" })
      .order("set_index", { referencedTable: "program_days.program_items.program_item_sets" })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as ProgramTree | null;
  }

  async getTree(programId: string): Promise<ProgramTree | null> {
    const { data, error } = await this.db
      .from("programs")
      .select(
        "*, program_days(*, program_items(*, exercises(id, name_ar, name_en, muscle_group, video_url, cues_ar, cues_en, steps_ar, steps_en, mistakes_ar, mistakes_en, safety_ar, safety_en, tempo), program_item_sets(*)))"
      )
      .eq("id", programId)
      .order("order_index", { referencedTable: "program_days" })
      .order("order_index", { referencedTable: "program_days.program_items" })
      .order("set_index", { referencedTable: "program_days.program_items.program_item_sets" })
      .maybeSingle();
    if (error) throw error;
    return data as ProgramTree | null;
  }

  async create(coachId: string, input: CreateProgramInput): Promise<Program> {
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

  async remove(id: string): Promise<boolean> {
    const { data, error } = await this.db.from("programs").delete().eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** Clones a template's whole tree onto a client. Three sequential inserts,
   * no transaction (PostgREST has none) — ponytail: a partial clone leaves
   * an orphan program the coach can delete; add an RPC if that ever bites. */
  async cloneToClient(programId: string, clientId: string): Promise<Program | null> {
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
      })
      .select()
      .single();
    if (programError) throw programError;

    for (const day of tree.program_days) {
      const { data: clonedDay, error: dayError } = await this.db
        .from("program_days")
        .insert({
          coach_id: tree.coach_id,
          client_id: clientId,
          program_id: cloned.id,
          day_index: day.day_index,
          order_index: day.order_index,
          label_ar: day.label_ar,
          label_en: day.label_en,
        })
        .select()
        .single();
      if (dayError) throw dayError;

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
          })
          .select()
          .single();
        if (itemError) throw itemError;

        // Per-set prescriptions must be cloned explicitly — they don't live
        // on program_items, so they're not carried by the insert above.
        if (item.program_item_sets.length > 0) {
          const { error: setsError } = await this.db.from("program_item_sets").insert(
            item.program_item_sets.map((set) => ({
              coach_id: tree.coach_id,
              client_id: clientId,
              program_item_id: clonedItem.id,
              set_index: set.set_index,
              reps: set.reps,
              weight: set.weight,
              rest_seconds: set.rest_seconds,
            }))
          );
          if (setsError) throw setsError;
        }
      }
    }

    return cloned;
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

    const { data, error } = await this.db
      .from("program_items")
      .insert({
        coach_id: parent.coach_id,
        client_id: parent.client_id,
        program_day_id: dayId,
        exercise_id: input.exercise_id,
        ...legacySnapshot(sets),
        progression_rule: input.progression_rule ?? "none",
        notes_ar: input.notes_ar,
        notes_en: input.notes_en,
      })
      .select()
      .single();
    if (error) throw error;

    const { error: setsError } = await this.db
      .from("program_item_sets")
      .insert(setRows(sets, parent.coach_id, parent.client_id, data.id));
    if (setsError) throw setsError;

    return data;
  }

  async updateItem(itemId: string, input: UpdateItemInput): Promise<boolean> {
    const { sets, ...itemFields } = input;
    const patch: Database["public"]["Tables"]["program_items"]["Update"] = { ...itemFields };
    if (sets) Object.assign(patch, legacySnapshot(sets));

    const { data, error } = await this.db
      .from("program_items")
      .update(patch)
      .eq("id", itemId)
      .select("id, coach_id, client_id");
    if (error) throw error;
    if (data.length === 0) return false;

    if (sets) {
      const { coach_id, client_id } = data[0];
      const { error: deleteError } = await this.db.from("program_item_sets").delete().eq("program_item_id", itemId);
      if (deleteError) throw deleteError;
      if (sets.length > 0) {
        const { error: insertError } = await this.db
          .from("program_item_sets")
          .insert(setRows(sets, coach_id, client_id, itemId));
        if (insertError) throw insertError;
      }
    }
    return true;
  }

  async removeItem(itemId: string): Promise<boolean> {
    const { data, error } = await this.db.from("program_items").delete().eq("id", itemId).select("id");
    if (error) throw error;
    return data.length > 0;
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

  /** Groups the given items into a superset/circuit — they render together
   * in the builder and, in the session, alternate one set per item per
   * round instead of each item finishing all its own sets first. The group
   * key is generated here (crypto.randomUUID, same entropy as a DB uuid
   * column, just not stored as one since group_key has no FK target of its
   * own) rather than accepted from the caller, so a client can't force a
   * collision with an existing group by guessing/reusing a key. Requires
   * at least 2 items — a "group" of one is just an ungrouped item. */
  async groupItems(itemIds: string[], kind: "superset" | "circuit"): Promise<number> {
    if (itemIds.length < 2) return 0;
    const groupKey = crypto.randomUUID();
    const { data, error } = await this.db
      .from("program_items")
      .update({ group_key: groupKey, group_kind: kind })
      .in("id", itemIds)
      .select("id");
    if (error) throw error;
    return data.length;
  }

  async ungroupItems(itemIds: string[]): Promise<number> {
    const { data, error } = await this.db
      .from("program_items")
      .update({ group_key: null, group_kind: null })
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
}
