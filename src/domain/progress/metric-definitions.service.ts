import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { slugifyMetricKey } from "./metric-definitions";

type MetricDefinition = Database["public"]["Tables"]["client_metric_definitions"]["Row"];

export type CreateMetricDefinitionInput = { label_ar: string; label_en: string; unit: string };

/** A coach's custom body-metric catalog -- see the migration's own comment
 * for why this exists alongside the hardcoded METRIC_PRESETS. Readable by
 * both the coach and their clients (tenant_read policy), writable by the
 * coach only. */
export class MetricDefinitionsService {
  constructor(private db: SupabaseClient<Database>) {}

  async list(coachId: string): Promise<MetricDefinition[]> {
    const { data, error } = await this.db
      .from("client_metric_definitions")
      .select("*")
      .eq("coach_id", coachId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  /** key is derived once at creation, not re-derived on read -- see
   * slugifyMetricKey's doc comment for why. */
  async create(coachId: string, input: CreateMetricDefinitionInput): Promise<MetricDefinition> {
    const { data, error } = await this.db
      .from("client_metric_definitions")
      .insert({ coach_id: coachId, key: slugifyMetricKey(input.label_en), ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async remove(id: string): Promise<boolean> {
    const { data, error } = await this.db.from("client_metric_definitions").delete().eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }
}
