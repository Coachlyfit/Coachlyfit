import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Observation = Database["public"]["Tables"]["client_observations"]["Row"];

/** Private coach notes about a client -- technique, adherence patterns,
 * motivation. Coach-only in both directions (see the migration's RLS
 * comment): unlike checkins/body_metrics, these are never client-authored
 * or client-visible. */
export class ObservationsService {
  constructor(private db: SupabaseClient<Database>) {}

  async list(clientId: string): Promise<Observation[]> {
    const { data, error } = await this.db
      .from("client_observations")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  async create(coachId: string, clientId: string, body: string): Promise<Observation> {
    const { data, error } = await this.db
      .from("client_observations")
      .insert({ coach_id: coachId, client_id: clientId, body })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async remove(id: string): Promise<boolean> {
    const { data, error } = await this.db.from("client_observations").delete().eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }
}
