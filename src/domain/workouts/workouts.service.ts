import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { computeSessionSummary } from "./summary";
import { sanitizeExtra } from "./set-measures";

/** One logged set resolved to the exercise actually performed — the input
 * shape prs.ts (strength and non-weight records) needs. */
export type SetLogForClient = {
  exercise_id: string;
  weight: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_m: number | null;
  calories: number | null;
  completed_at: string;
};

type WorkoutSession = Database["public"]["Tables"]["workout_sessions"]["Row"];
type WorkoutSetLog = Database["public"]["Tables"]["workout_set_logs"]["Row"];
type WorkoutExerciseResult = Database["public"]["Tables"]["workout_exercise_results"]["Row"];

export type LogSetInput = {
  /** Client-generated uuid for a set logged offline. Omitted = DB default. */
  id?: string;
  /** Device clock when the set was logged (ISO). Only sent on creation, never
   * on an edit, so editing a set can't extend its 7-day lock window. */
  client_logged_at?: string;
  program_item_id: string;
  set_index: number;
  /** Negative for assisted bodyweight work (see measurement.ts). */
  weight?: number | null;
  reps?: number | null;
  /** Actual hold/work time for a duration-based set — the logged counterpart
   * to program_item_sets.duration_seconds. */
  duration_seconds?: number | null;
  /** Metres, whatever unit the client typed it in. */
  distance_m?: number | null;
  calories?: number | null;
  /** Reps in reserve. */
  rir?: number | null;
  /** Long-tail metrics: rounds, work_s, rest_s, level, incline, speed, laps,
   * steps, plus the per-set tags side ('left'|'right') and set_type
   * ('warmup'|'drop'|'failure'). */
  extra?: Record<string, number | string> | null;
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
  duration_seconds?: number | null;
  distance_m?: number | null;
  calories?: number | null;
  rir?: number | null;
  extra?: Record<string, number | string> | null;
  rpe?: number | null;
  notes?: string | null;
};

export type LastPerformance = {
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  duration_seconds: number | null;
  distance_m: number | null;
  calories: number | null;
  extra: Record<string, number | string> | null;
};

export type ExerciseResultInput = {
  status: "done" | "skipped";
  difficulty?: number | null;
  pain?: number | null;
  energy?: number | null;
  notes?: string | null;
};

export type SwapSummary = {
  original: { ar: string; en: string };
  substitute: { ar: string; en: string };
};

export type RecentSession = WorkoutSession & {
  program_days: { label_ar: string | null; label_en: string | null } | null;
  swaps: SwapSummary[];
};

export type HistorySession = {
  id: string;
  started_at: string;
  program_days: { label_ar: string | null; label_en: string | null } | null;
  workout_set_logs: {
    exercise_id: string | null;
    set_index: number;
    weight: number | null;
    reps: number | null;
    duration_seconds?: number | null;
    distance_m?: number | null;
    calories?: number | null;
    exercises: { name_ar: string; name_en: string; measurement_type?: string | null } | null;
  }[];
};

export type ExerciseSeriesPoint = {
  session_id: string;
  weight: number | null;
  reps: number | null;
  duration_seconds?: number | null;
  distance_m?: number | null;
  calories?: number | null;
  completed_at: string;
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

  /** The in-progress or most recently completed session for a program_day
   * within [weekStartIso, weekStartIso + 7 days), so the workout screen can
   * resume with already-toggled sets rather than starting a duplicate
   * session if the client backgrounds the app -- scoped to the calendar
   * week because program_day_id repeats every cycle (cycle/weekly schedule
   * modes both reuse the same program_days row across weeks, see
   * program-cycle.ts), so an unscoped lookup would resurface a completed
   * session from a previous week as still "done" and block re-logging. */
  async getSessionForDay(programDayId: string, weekStartIso: string): Promise<WorkoutSession | null> {
    const weekEndIso = new Date(new Date(weekStartIso).getTime() + 7 * 86_400_000).toISOString();
    const { data, error } = await this.db
      .from("workout_sessions")
      .select("*")
      .eq("program_day_id", programDayId)
      .gte("started_at", `${weekStartIso}T00:00:00.000Z`)
      .lt("started_at", weekEndIso)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Client home numbers: how many workouts the client has ever completed,
   * and when each one completed since `weekStartIso` (for "3 of 5 this
   * week"). Read-only; RLS's client_own scopes both queries to the caller. */
  async completedStats(clientId: string, weekStartIso: string): Promise<{ total: number; weekStartedAt: string[] }> {
    const [{ count, error: countError }, { data, error }] = await Promise.all([
      this.db
        .from("workout_sessions")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .not("completed_at", "is", null),
      this.db
        .from("workout_sessions")
        .select("started_at")
        .eq("client_id", clientId)
        .not("completed_at", "is", null)
        .gte("started_at", `${weekStartIso}T00:00:00.000Z`),
    ]);
    if (countError) throw countError;
    if (error) throw error;
    return { total: count ?? 0, weekStartedAt: (data ?? []).map((r) => r.started_at) };
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

    // Offline-logged set: completed_at follows the device clock, clamped to
    // now() so it can't be forward-dated. No client_logged_at (online path, or
    // an edit) leaves completed_at to the column default / existing value.
    const { client_logged_at, ...rest } = input;
    const loggedAt = client_logged_at ? Math.min(Date.parse(client_logged_at), Date.now()) : NaN;
    const offlineFields = Number.isNaN(loggedAt)
      ? {}
      : { client_logged_at, completed_at: new Date(loggedAt).toISOString() };

    const { data, error } = await this.db
      .from("workout_set_logs")
      .upsert(
        {
          coach_id: parent.coach_id,
          client_id: parent.client_id,
          session_id: sessionId,
          ...rest,
          ...offlineFields,
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

  /** Outbox delete: keyed by the set's natural key rather than its id, and
   * idempotent (a replay after the first delete landed matches zero rows,
   * which is success, not an error). */
  async deleteSetByKey(sessionId: string, programItemId: string, setIndex: number): Promise<void> {
    const { error } = await this.db
      .from("workout_set_logs")
      .delete()
      .eq("session_id", sessionId)
      .eq("program_item_id", programItemId)
      .eq("set_index", setIndex);
    if (error) throw error;
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
   * clientId filter is needed beyond that. `excludeSessionId` keeps a
   * resumed session's own sets from showing up as "last time". */
  async getLastPerformance(exerciseIds: string[], excludeSessionId?: string): Promise<Map<string, LastPerformance>> {
    if (exerciseIds.length === 0) return new Map();

    let q = this.db
      .from("workout_set_logs")
      .select("weight, reps, rpe, duration_seconds, distance_m, calories, extra, completed_at, program_items!inner(exercise_id)")
      .in("program_items.exercise_id", exerciseIds);
    if (excludeSessionId) q = q.neq("session_id", excludeSessionId);
    const { data, error } = await q.order("completed_at", { ascending: false }).limit(200);
    if (error) throw error;

    const byExercise = new Map<string, LastPerformance>();
    for (const row of data as unknown as (Omit<LastPerformance, "extra"> & {
      extra: unknown;
      program_items: { exercise_id: string } | null;
    })[]) {
      const exerciseId = row.program_items?.exercise_id;
      if (!exerciseId || byExercise.has(exerciseId)) continue;
      byExercise.set(exerciseId, {
        weight: row.weight,
        reps: row.reps,
        rpe: row.rpe,
        duration_seconds: row.duration_seconds,
        distance_m: row.distance_m,
        calories: row.calories,
        extra: sanitizeExtra(row.extra),
      });
    }
    return byExercise;
  }

  /** Marks an exercise done or skipped for a session, optionally with
   * post-exercise feedback (difficulty/pain/energy/notes). Upserts on the
   * (session_id, program_item_id) unique key -- a client re-opening the
   * feedback sheet to add a note after already marking "done" updates the
   * same row rather than erroring on the constraint. Same
   * derive-from-parent rule as logSet: coach_id/client_id always come from
   * the session, never the caller. */
  async setExerciseResult(sessionId: string, programItemId: string, input: ExerciseResultInput): Promise<WorkoutExerciseResult | null> {
    const { data: parent, error: parentError } = await this.db
      .from("workout_sessions")
      .select("coach_id, client_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (!parent) return null;

    const { data, error } = await this.db
      .from("workout_exercise_results")
      .upsert(
        {
          coach_id: parent.coach_id,
          client_id: parent.client_id,
          session_id: sessionId,
          program_item_id: programItemId,
          ...input,
        },
        { onConflict: "session_id,program_item_id" }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Persists in-progress elapsed time (and, optionally, which exercise the
   * client is currently on) so a refresh/backgrounding doesn't reset the
   * timer to 0 on resume. Fire-and-forget from the client's perspective —
   * called on an interval, not awaited for user feedback, so this
   * deliberately doesn't distinguish "no row" from "ok" the way other
   * writes here do. */
  async saveSessionProgress(sessionId: string, elapsedSeconds: number, currentItemId: string | null): Promise<void> {
    const { error } = await this.db
      .from("workout_sessions")
      .update({ elapsed_seconds: elapsedSeconds, current_item_id: currentItemId })
      .eq("id", sessionId);
    if (error) throw error;
  }

  /** Pain reports (pain > 0) for a client, most recent first — the coach
   * compliance view's "needs attention" signal so a client's own private
   * one-tap feedback (ExerciseFeedbackSheet) actually reaches the coach
   * instead of sitting unread in workout_exercise_results. RLS's
   * coach_read (select-only) already scopes this to the caller's own
   * clients, same as listRecentSessions/listSetLogsForClient. */
  async listPainReports(clientId: string, limit = 10): Promise<
    (WorkoutExerciseResult & { program_items: { exercises: { name_ar: string; name_en: string } | null } | null })[]
  > {
    const { data, error } = await this.db
      .from("workout_exercise_results")
      .select("*, program_items(exercises(name_ar, name_en))")
      .eq("client_id", clientId)
      .gt("pain", 0)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  async listExerciseResults(sessionId: string): Promise<WorkoutExerciseResult[]> {
    const { data, error } = await this.db
      .from("workout_exercise_results")
      .select("*")
      .eq("session_id", sessionId);
    if (error) throw error;
    return data;
  }

  /** All completed set logs for a client, resolved to their real exercise_id
   * (via program_items, and overridden by substituted_exercise_id when the
   * client swapped mid-session) — the input shape prs.ts and the coach's
   * Strength tab / client's own PR cards need. `since` is an inclusive ISO
   * timestamp, same convention as ProgressService.listCheckins; omit for
   * full history. RLS's coach_read/client_own already scope this to either
   * the caller's own logs (client) or their own clients' logs (coach) — no
   * separate clientId filter needed beyond what the caller already has
   * from their session. */
  async listSetLogsForClient(clientId: string, since?: string): Promise<SetLogForClient[]> {
    let q = this.db
      .from("workout_set_logs")
      .select(
        "weight, reps, duration_seconds, distance_m, calories, completed_at, substituted_exercise_id, program_items!inner(exercise_id)"
      )
      .eq("client_id", clientId);
    if (since) q = q.gte("completed_at", since);
    const { data, error } = await q.order("completed_at", { ascending: true });
    if (error) throw error;

    return (data as unknown as (Omit<SetLogForClient, "exercise_id"> & {
      substituted_exercise_id: string | null;
      program_items: { exercise_id: string } | null;
    })[])
      .filter((row) => row.program_items != null)
      .map((row) => ({
        exercise_id: row.substituted_exercise_id ?? row.program_items!.exercise_id,
        weight: row.weight,
        reps: row.reps,
        duration_seconds: row.duration_seconds,
        distance_m: row.distance_m,
        calories: row.calories,
        completed_at: row.completed_at,
      }));
  }

  /** Computes and persists the session summary (total volume, sets
   * completed/prescribed) alongside marking it done — a cheap read for
   * every future history-list render instead of re-aggregating
   * workout_set_logs each time. sets_prescribed comes from the session's
   * program_day (via program_items -> program_item_sets), not from the
   * logs themselves, so a client who skipped exercises still shows the
   * true prescribed count relative to what they actually did. */
  async completeSession(sessionId: string, durationSeconds: number): Promise<boolean> {
    const { data: session, error: sessionError } = await this.db
      .from("workout_sessions")
      .select("program_day_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError) throw sessionError;

    let totalVolume = 0;
    let setsCompleted = 0;
    let setsPrescribed: number | null = null;

    if (session) {
      const [{ data: logs }, { data: items }] = await Promise.all([
        this.db.from("workout_set_logs").select("weight, reps").eq("session_id", sessionId),
        this.db
          .from("program_items")
          .select("program_item_sets(id)")
          .eq("program_day_id", session.program_day_id),
      ]);
      const summary = computeSessionSummary(logs ?? []);
      totalVolume = summary.totalVolume;
      setsCompleted = summary.setsCompleted;
      setsPrescribed = (items ?? []).reduce((sum, item) => sum + item.program_item_sets.length, 0);
    }

    const { data, error } = await this.db
      .from("workout_sessions")
      .update({
        completed_at: new Date().toISOString(),
        duration_seconds: durationSeconds,
        total_volume: totalVolume,
        sets_completed: setsCompleted,
        sets_prescribed: setsPrescribed,
      })
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

  /** Coach weight history: sessions (newest first) with their logged sets,
   * optionally narrowed to one exercise and a started_at range. `fromIso`
   * is inclusive, `toIso` exclusive. Fetches limit + 1 rows so the caller
   * knows whether "load more" has anything to load. RLS's coach_read scopes
   * this to the caller's own clients; `clientId` only narrows it. */
  async listHistorySessions(
    clientId: string,
    opts: { fromIso?: string; toIso?: string; exerciseId?: string; limit: number }
  ): Promise<{ sessions: HistorySession[]; hasMore: boolean }> {
    let q = this.db
      .from("workout_sessions")
      .select(
        "id, started_at, program_days(label_ar, label_en), workout_set_logs!inner(exercise_id, set_index, weight, reps, duration_seconds, distance_m, calories, exercises!workout_set_logs_exercise_id_fkey(name_ar, name_en, measurement_type))"
      )
      .eq("client_id", clientId);
    if (opts.fromIso) q = q.gte("started_at", opts.fromIso);
    if (opts.toIso) q = q.lt("started_at", opts.toIso);
    if (opts.exerciseId) q = q.eq("workout_set_logs.exercise_id", opts.exerciseId);
    const { data, error } = await q.order("started_at", { ascending: false }).limit(opts.limit + 1);
    if (error) throw error;

    const rows = data as unknown as HistorySession[];
    return { sessions: rows.slice(0, opts.limit), hasMore: rows.length > opts.limit };
  }

  /** Every logged set of one exercise in the range, oldest first — the
   * input for the progress chart. */
  async listExerciseSeries(
    clientId: string,
    exerciseId: string,
    opts: { fromIso?: string; toIso?: string } = {}
  ): Promise<ExerciseSeriesPoint[]> {
    let q = this.db
      .from("workout_set_logs")
      .select("session_id, weight, reps, duration_seconds, distance_m, calories, completed_at")
      .eq("client_id", clientId)
      .eq("exercise_id", exerciseId);
    if (opts.fromIso) q = q.gte("completed_at", opts.fromIso);
    if (opts.toIso) q = q.lt("completed_at", opts.toIso);
    // ponytail: newest 1000 sets (PostgREST max-rows); page by date range if one exercise ever exceeds that.
    const { data, error } = await q.order("completed_at", { ascending: false }).limit(1000);
    if (error) throw error;
    return data.reverse();
  }

  /** Best set (heaviest, then most reps) per exercise, aggregated in SQL —
   * see public.exercise_bests. security invoker, so RLS applies. */
  async listExerciseBests(clientId: string, opts: { fromIso?: string; toIso?: string } = {}) {
    const { data, error } = await this.db.rpc("exercise_bests", {
      p_client_id: clientId,
      p_from: opts.fromIso,
      p_to: opts.toIso,
    });
    if (error) throw error;
    return data;
  }

  /** `program_items(exercises(...))` is the ONLY foreign key between those
   * two tables, so it needs no hint. workout_set_logs has TWO foreign keys
   * to exercises (substituted_exercise_id, exercise_id), so that embed is
   * pinned to substituted_exercise_id — unhinted, PostgREST refuses to
   * guess and returns PGRST201. */
  private async fetchSwaps(sessionIds: string[]): Promise<Map<string, SwapSummary[]>> {
    const { data, error } = await this.db
      .from("workout_set_logs")
      .select(
        "session_id, program_item_id, program_items(exercises(name_ar, name_en)), exercises!workout_set_logs_substituted_exercise_id_fkey(name_ar, name_en)"
      )
      .in("session_id", sessionIds)
      .not("substituted_exercise_id", "is", null);
    if (error) throw error;
    return groupSwapsBySession((data ?? []) as SwapRow[]);
  }
}
