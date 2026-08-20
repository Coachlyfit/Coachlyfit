import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type WorkoutSession = Database["public"]["Tables"]["workout_sessions"]["Row"];
type WorkoutSetLog = Database["public"]["Tables"]["workout_set_logs"]["Row"];

export type LogSetInput = {
  program_item_id: string;
  set_index: number;
  weight?: number | null;
  reps?: number | null;
};

export type RecentSession = WorkoutSession & {
  program_days: { label_ar: string | null; label_en: string | null } | null;
};

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

  async logSet(sessionId: string, input: LogSetInput): Promise<WorkoutSetLog | null> {
    const { data: parent, error: parentError } = await this.db
      .from("workout_sessions")
      .select("coach_id, client_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (!parent) return null;

    const { data, error } = await this.db
      .from("workout_set_logs")
      .insert({ coach_id: parent.coach_id, client_id: parent.client_id, session_id: sessionId, ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
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
    return data;
  }
}
