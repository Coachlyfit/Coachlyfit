import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Program = Database["public"]["Tables"]["programs"]["Row"];
type ProgramDay = Database["public"]["Tables"]["program_days"]["Row"];
type ProgramItem = Database["public"]["Tables"]["program_items"]["Row"];
type Exercise = Database["public"]["Tables"]["exercises"]["Row"];

export type ProgramScope = "all" | "assigned" | "templates";

export type CreateProgramInput = {
  client_id?: string | null;
  name_ar: string;
  name_en: string;
  start_date?: string;
  end_date?: string | null;
};

export type CreateDayInput = { day_index: number; label_ar?: string; label_en?: string };
export type UpdateDayInput = Partial<CreateDayInput>;

export type CreateItemInput = {
  exercise_id: string;
  sets?: number;
  reps?: string;
  rest_seconds?: number | null;
  notes_ar?: string;
  notes_en?: string;
};
export type UpdateItemInput = Partial<CreateItemInput>;

export type ProgramTree = Program & {
  program_days: (ProgramDay & {
    program_items: (ProgramItem & {
      exercises: Pick<Exercise, "id" | "name_ar" | "name_en" | "muscle_group" | "video_url" | "cues_ar" | "cues_en">;
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
        "*, program_days(*, program_items(*, exercises(id, name_ar, name_en, muscle_group, video_url, cues_ar, cues_en)))"
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .order("order_index", { referencedTable: "program_days" })
      .order("order_index", { referencedTable: "program_days.program_items" })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as ProgramTree | null;
  }

  async getTree(programId: string): Promise<ProgramTree | null> {
    const { data, error } = await this.db
      .from("programs")
      .select(
        "*, program_days(*, program_items(*, exercises(id, name_ar, name_en, muscle_group, video_url, cues_ar, cues_en)))"
      )
      .eq("id", programId)
      .order("order_index", { referencedTable: "program_days" })
      .order("order_index", { referencedTable: "program_days.program_items" })
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

      if (day.program_items.length === 0) continue;
      const { error: itemsError } = await this.db.from("program_items").insert(
        day.program_items.map((item) => ({
          coach_id: tree.coach_id,
          client_id: clientId,
          program_day_id: clonedDay.id,
          exercise_id: item.exercise_id,
          sets: item.sets,
          reps: item.reps,
          rest_seconds: item.rest_seconds,
          notes_ar: item.notes_ar,
          notes_en: item.notes_en,
          order_index: item.order_index,
        }))
      );
      if (itemsError) throw itemsError;
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

  /** Same derivation, one level deeper — parent is `program_days`. */
  async addItem(dayId: string, input: CreateItemInput): Promise<ProgramItem | null> {
    const { data: parent, error: parentError } = await this.db
      .from("program_days")
      .select("coach_id, client_id")
      .eq("id", dayId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (!parent) return null;

    const { data, error } = await this.db
      .from("program_items")
      .insert({
        coach_id: parent.coach_id,
        client_id: parent.client_id,
        program_day_id: dayId,
        ...input,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateItem(itemId: string, input: UpdateItemInput): Promise<boolean> {
    const { data, error } = await this.db.from("program_items").update(input).eq("id", itemId).select("id");
    if (error) throw error;
    return data.length > 0;
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

  async reorderItems(dayId: string, orderedIds: string[]): Promise<number> {
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
}
