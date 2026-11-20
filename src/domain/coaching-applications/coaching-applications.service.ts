import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ApplicationStatus, TriageInput } from "./schema";

export type ApplicationRow = Database["public"]["Tables"]["coaching_applications"]["Row"];

export class CoachingApplicationsService {
  constructor(private db: SupabaseClient<Database>) {}

  async list(coachId: string, status?: ApplicationStatus): Promise<ApplicationRow[]> {
    let q = this.db.from("coaching_applications").select("*").eq("coach_id", coachId).order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  async get(coachId: string, id: string): Promise<ApplicationRow | null> {
    const { data, error } = await this.db.from("coaching_applications").select("*").eq("coach_id", coachId).eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Status and notes are all a coach can change; the database refuses the rest. */
  async triage(coachId: string, id: string, input: TriageInput): Promise<void> {
    const patch: { status: ApplicationStatus; coach_notes?: string | null } = { status: input.status };
    if (input.coachNotes !== undefined) patch.coach_notes = input.coachNotes || null;
    const { error } = await this.db.from("coaching_applications").update(patch).eq("coach_id", coachId).eq("id", id);
    if (error) throw error;
  }
}
