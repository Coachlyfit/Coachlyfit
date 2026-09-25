import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { CreateRehabPhaseInput, CreateRehabProtocolInput, UpdateRehabPhaseInput, UpdateRehabProtocolInput } from "./programs.service";

type RehabProtocol = Database["public"]["Tables"]["rehab_protocols"]["Row"];
type RehabPhase = Database["public"]["Tables"]["rehab_phases"]["Row"];

/** Rehab protocol/phase CRUD, split out from ProgramsService only because
 * that file was already large — same derive-from-parent rule as every
 * write there (coach_id/client_id always come from an RLS-scoped read of
 * the parent, never a caller argument). Rehab EXERCISES aren't managed
 * here: they're ordinary program_items with block='rehab' and
 * rehab_phase_id, added/edited through ProgramsService.addItem/updateItem
 * like any other item. */
export class RehabService {
  constructor(private db: SupabaseClient<Database>) {}

  async addProtocol(programId: string, input: CreateRehabProtocolInput): Promise<RehabProtocol | null> {
    const { data: parent, error: parentError } = await this.db
      .from("programs")
      .select("coach_id, client_id")
      .eq("id", programId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (!parent) return null;

    const { data, error } = await this.db
      .from("rehab_protocols")
      .insert({ coach_id: parent.coach_id, client_id: parent.client_id, program_id: programId, ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateProtocol(protocolId: string, input: UpdateRehabProtocolInput): Promise<boolean> {
    const { data, error } = await this.db.from("rehab_protocols").update(input).eq("id", protocolId).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async removeProtocol(protocolId: string): Promise<boolean> {
    const { data, error } = await this.db.from("rehab_protocols").delete().eq("id", protocolId).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async addPhase(protocolId: string, input: CreateRehabPhaseInput): Promise<RehabPhase | null> {
    const { data: parent, error: parentError } = await this.db
      .from("rehab_protocols")
      .select("coach_id, client_id")
      .eq("id", protocolId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (!parent) return null;

    const { data, error } = await this.db
      .from("rehab_phases")
      .insert({ coach_id: parent.coach_id, client_id: parent.client_id, protocol_id: protocolId, ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updatePhase(phaseId: string, input: UpdateRehabPhaseInput): Promise<boolean> {
    const { data, error } = await this.db.from("rehab_phases").update(input).eq("id", phaseId).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async removePhase(phaseId: string): Promise<boolean> {
    const { data, error } = await this.db.from("rehab_phases").delete().eq("id", phaseId).select("id");
    if (error) throw error;
    return data.length > 0;
  }
}
