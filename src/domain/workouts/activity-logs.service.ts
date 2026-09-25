import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type ActivityLog = Database["public"]["Tables"]["activity_logs"]["Row"];

export type LogActivityInput = {
  performed_on?: string;
  duration_min?: number | null;
  distance_km?: number | null;
  avg_hr?: number | null;
  kcal?: number | null;
  rpe?: number | null;
  notes?: string | null;
};

/** Client-authored logs against a coach-prescribed cardio/recovery activity
 * (program_activities). Same shape as WorkoutsService.logSet: upserts on
 * the (program_activity_id, performed_on) unique key so a retry or a
 * second device never duplicates the same day's entry, and the 7-day edit
 * lock (activity_logs_reject_stale_edit) is enforced by the DB trigger, not
 * here — an update/delete past the window throws error 42501, same as
 * workout_set_logs.
 *
 * coach_id/client_id are always derived from the RLS-scoped
 * program_activities parent row, never taken from a caller argument — same
 * rule as every write in ProgramsService/DietPlansService (see
 * ProgramsService's class doc for why). */
export class ActivityLogsService {
  constructor(private db: SupabaseClient<Database>) {}

  async logActivity(activityId: string, input: LogActivityInput): Promise<ActivityLog | null> {
    const { data: parent, error: parentError } = await this.db
      .from("program_activities")
      .select("coach_id, client_id")
      .eq("id", activityId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (!parent || !parent.client_id) return null; // template row, no client to log against

    const { data, error } = await this.db
      .from("activity_logs")
      .upsert(
        {
          coach_id: parent.coach_id,
          client_id: parent.client_id,
          program_activity_id: activityId,
          performed_on: input.performed_on ?? new Date().toISOString().slice(0, 10),
          duration_min: input.duration_min,
          distance_km: input.distance_km,
          avg_hr: input.avg_hr,
          kcal: input.kcal,
          rpe: input.rpe,
          notes: input.notes,
        },
        { onConflict: "program_activity_id,performed_on" }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async listForDate(clientId: string, date: string) {
    const { data, error } = await this.db
      .from("activity_logs")
      .select("*")
      .eq("client_id", clientId)
      .eq("performed_on", date);
    if (error) throw error;
    return data;
  }

  async listForClient(clientId: string, limit = 30) {
    const { data, error } = await this.db
      .from("activity_logs")
      .select("*, program_activities(kind, modality)")
      .eq("client_id", clientId)
      .order("performed_on", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  async remove(logId: string): Promise<boolean> {
    const { data, error } = await this.db.from("activity_logs").delete().eq("id", logId).select("id");
    if (error) throw error;
    return data.length > 0;
  }
}
