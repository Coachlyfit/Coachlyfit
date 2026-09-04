import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type WorkoutSession = Database["public"]["Tables"]["workout_sessions"]["Row"];
type WorkoutSetLog = Database["public"]["Tables"]["workout_set_logs"]["Row"];

export type LogSetInput = {
  program_item_id: string;
  set_index: number;
  weight?: number | null;
  reps?: number | null;
  /** Which exercise the client actually performed this set on, if different
   * from what program_items prescribes. null/omitted = prescribed exercise,
   * same as before this field existed. */
  substituted_exercise_id?: string | null;
  rpe?: number | null;
  notes?: string | null;
};

export type UpdateSetInput = {
  weight?: number | null;
  reps?: number | null;
  rpe?: number | null;
  notes?: string | null;
};

export type LastPerformance = {
  weight: number | null;
  reps: number | null;
  rpe: number | null;
};

export type SwapSummary = {
  original: { ar: string; en: string };
  substitute: { ar: string; en: string };
};

export type RecentSession = WorkoutSession & {
  program_days: { label_ar: string | null; label_en: string | null } | null;
  swaps: SwapSummary[];
};

type SwapRow = {
  session_id: string;
  program_item_id: string;
  program_items: { exercises: { name_ar: string; name_en: string } | null } | null;
  exercises: { name_ar: string; name_en: string } | null;
};

/** One entry per distinct swapped exercise per session — a swapped exercise
 * usually has several logged sets, this collapses them to one summary line.
 * Pure and exported so it's testable without mocking the two-query fetch
 * that produces its input (see fetchSwaps below). */
export function groupSwapsBySession(rows: SwapRow[]): Map<string, SwapSummary[]> {
  const seen = new Set<string>();
  const bySession = new Map<string, SwapSummary[]>();
  for (const row of rows) {
    const key = `${row.session_id}-${row.program_item_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const original = row.program_items?.exercises;
    const substitute = row.exercises;
    if (!original || !substitute) continue;
    const summary: SwapSummary = {
      original: { ar: original.name_ar, en: original.name_en },
      substitute: { ar: substitute.name_ar, en: substitute.name_en },
    };
    const list = bySession.get(row.session_id) ?? [];
    list.push(summary);
    bySession.set(row.session_id, list);
  }
  return bySession;
}

/** Client-side execution of a program_day — separate from program_items
 * (the prescription), which stays untouched here. See the migration
 * comment (20260802000001) for why: program_items doubles as a clonable
 * template row, and logging real performance onto it would corrupt the
 * template/instance distinction.
 *
 * Same derivation rule as ProgramsService: coach_id/client_id are never
 * taken from a caller argument, always re-read from the RLS-scoped parent
 * row before insert. */
export class WorkoutsService {
  constructor(private db: SupabaseClient<Database>) {}

  async startSession(programDayId: string): Promise<WorkoutSession | null> {
    const { data: parent, error: parentError } = await this.db
      .from("program_days")
      .select("coach_id, client_id")
      .eq("id", programDayId)
      .maybeSingle();
    if (parentError) throw parentError;
    // client_id is nullable on program_days (template rows, see
    // 20260801000016_program_templates.sql) — a template day has no client
    // to log a session against.
    if (!parent || !parent.client_id) return null;

    const { data, error } = await this.db
      .from("workout_sessions")
      .insert({ coach_id: parent.coach_id, client_id: parent.client_id, program_day_id: programDayId })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** The in-progress or most recently completed session for a program_day,
   * so the workout screen can resume with already-toggled sets rather than
   * starting a duplicate session if the client backgrounds the app. */
  async getSessionForDay(programDayId: string): Promise<WorkoutSession | null> {
    const { data, error } = await this.db
      .from("workout_sessions")
      .select("*")
      .eq("program_day_id", programDayId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Upserts on the (session_id, program_item_id, set_index) unique key
   * (20260829000001_workout_set_logs_actuals.sql) rather than a plain
   * insert -- a retry after a flaky connection or a resumed session on a
   * second device overwrites the same set instead of duplicating it. The
   * prescribed_reps/prescribed_weight snapshot is always read server-side
   * from program_item_sets, never taken from the caller -- so editing a
   * program's prescription later never rewrites what an already-logged set
   * says it was prescribed against. */
  async logSet(sessionId: string, input: LogSetInput): Promise<WorkoutSetLog | null> {
    const { data: parent, error: parentError } = await this.db
      .from("workout_sessions")
      .select("coach_id, client_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (!parent) return null;

    const { data: prescribed } = await this.db
      .from("program_item_sets")
      .select("reps, weight")
      .eq("program_item_id", input.program_item_id)
      .eq("set_index", input.set_index)
      .maybeSingle();

    const { data, error } = await this.db
      .from("workout_set_logs")
      .upsert(
        {
          coach_id: parent.coach_id,
          client_id: parent.client_id,
          session_id: sessionId,
          ...input,
          prescribed_reps: prescribed?.reps ?? null,
          prescribed_weight: prescribed?.weight ?? null,
        },
        { onConflict: "session_id,program_item_id,set_index" }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Edits an already-logged set — the client mis-tapped a weight/rep, or
   * wants to add an RPE/note after the fact. Scoped by RLS's client_own
   * (for all); returns null on an RLS no-op rather than throwing, same
   * convention as every other write in this service. */
  async updateSet(logId: string, input: UpdateSetInput): Promise<WorkoutSetLog | null> {
    const { data, error } = await this.db
      .from("workout_set_logs")
      .update(input)
      .eq("id", logId)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async deleteSet(logId: string): Promise<boolean> {
    const { data, error } = await this.db.from("workout_set_logs").delete().eq("id", logId).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async listSetLogs(sessionId: string): Promise<WorkoutSetLog[]> {
    const { data, error } = await this.db
      .from("workout_set_logs")
      .select("*")
      .eq("session_id", sessionId)
      .order("set_index", { ascending: true });
    if (error) throw error;
    return data;
  }

  /** Latest logged set per exercise, keyed by exercise_id rather than
   * program_item_id — a program can be re-cloned/re-assigned with new
   * program_items for the same exercise, and history should still follow
   * the exercise, not the row. Used to prefill SetEntrySheet and to drive
   * suggestNextWeight (suggest.ts). One query for the whole day: RLS's
   * client_own already scopes this to the caller's own logs, so no
   * clientId filter is needed beyond that. */
  async getLastPerformance(exerciseIds: string[]): Promise<Map<string, LastPerformance>> {
    if (exerciseIds.length === 0) return new Map();

    const { data, error } = await this.db
      .from("workout_set_logs")
      .select("weight, reps, rpe, completed_at, program_items!inner(exercise_id)")
      .in("program_items.exercise_id", exerciseIds)
      .order("completed_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const byExercise = new Map<string, LastPerformance>();
    for (const row of data as unknown as { weight: number | null; reps: number | null; rpe: number | null; program_items: { exercise_id: string } | null }[]) {
      const exerciseId = row.program_items?.exercise_id;
      if (!exerciseId || byExercise.has(exerciseId)) continue;
      byExercise.set(exerciseId, { weight: row.weight, reps: row.reps, rpe: row.rpe });
    }
    return byExercise;
  }

  async completeSession(sessionId: string, durationSeconds: number): Promise<boolean> {
    const { data, error } = await this.db
      .from("workout_sessions")
      .update({ completed_at: new Date().toISOString(), duration_seconds: durationSeconds })
      .eq("id", sessionId)
      .select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** Coach-facing compliance view — RLS's coach_read (select-only) already
   * scopes this to the caller's own clients, same as ProgressService's
   * client-authored-data methods. */
  async listRecentSessions(clientId: string, limit = 10): Promise<RecentSession[]> {
    const { data, error } = await this.db
      .from("workout_sessions")
      .select("*, program_days(label_ar, label_en)")
      .eq("client_id", clientId)
      .order("started_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const sessionIds = data.map((session) => session.id);
    const swapsBySession = sessionIds.length > 0 ? await this.fetchSwaps(sessionIds) : new Map<string, SwapSummary[]>();

    return data.map((session) => ({ ...session, swaps: swapsBySession.get(session.id) ?? [] }));
  }

  /** Both `program_items(exercises(...))` and the direct `exercises(...)`
   * (via substituted_exercise_id) are each the ONLY foreign key between
   * their two tables, so neither embed is ambiguous — no `!fk_name` hint
   * needed (contrast with a table that has two FKs to the same target,
   * where PostgREST refuses to guess and returns PGRST201). */
  private async fetchSwaps(sessionIds: string[]): Promise<Map<string, SwapSummary[]>> {
    const { data, error } = await this.db
      .from("workout_set_logs")
      .select("session_id, program_item_id, program_items(exercises(name_ar, name_en)), exercises(name_ar, name_en)")
      .in("session_id", sessionIds)
      .not("substituted_exercise_id", "is", null);
    if (error) throw error;
    return groupSwapsBySession((data ?? []) as SwapRow[]);
  }
}
