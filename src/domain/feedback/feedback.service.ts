import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Feedback = Database["public"]["Tables"]["feedback"]["Row"];

/** A coach's free-text feedback -- write-only for the coach who submits it
 * (see the migration's RLS comment: there's no select-own policy, only
 * coach_insert + admin_read), so listAll() is admin-only in practice and
 * takes no coachId -- admin_read lets it see every coach's rows. Same
 * shape as ObservationsService, no dedicated test (plain insert/select,
 * no branching). */
export class FeedbackService {
  constructor(private db: SupabaseClient<Database>) {}

  async create(coachId: string, body: string): Promise<void> {
    const { error } = await this.db.from("feedback").insert({ coach_id: coachId, body });
    if (error) throw error;
  }

  async listAll(): Promise<Feedback[]> {
    const { data, error } = await this.db
      .from("feedback")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }
}
