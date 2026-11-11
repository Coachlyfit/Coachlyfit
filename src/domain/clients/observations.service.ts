import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { OBSERVATION_IMAGES_BUCKET, type ObservationFields, type ObservationLinkType } from "./observations";

export type Observation = Database["public"]["Tables"]["client_observations"]["Row"];

export type ObservationLinkOptions = {
  programs: { id: string; name: string }[];
  /** Latest check-ins, `date` is the raw YYYY-MM-DD. */
  checkins: { id: string; date: string }[];
};

const CHECKIN_OPTIONS_LIMIT = 60;

function toRow(fields: ObservationFields) {
  return {
    title: fields.title,
    category: fields.category,
    severity: fields.severity,
    details: fields.details || null,
    linked_type: fields.linked?.type ?? null,
    linked_id: fields.linked?.id ?? null,
    image_path: fields.image_path,
  };
}

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

  async create(coachId: string, clientId: string, fields: ObservationFields): Promise<Observation> {
    const { data, error } = await this.db
      .from("client_observations")
      .insert({ coach_id: coachId, client_id: clientId, ...toRow(fields) })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** false when the note doesn't exist / isn't the caller's (RLS hides it). */
  async update(id: string, fields: ObservationFields): Promise<boolean> {
    const { data: before, error: readError } = await this.db
      .from("client_observations")
      .select("image_path")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!before) return false;

    const { data, error } = await this.db.from("client_observations").update(toRow(fields)).eq("id", id).select("id");
    if (error) throw error;
    if (data.length === 0) return false;

    // Image replaced or removed: drop the old object. Best-effort -- a failed
    // cleanup leaves an orphan file, never a broken note.
    if (before.image_path && before.image_path !== fields.image_path) await this.removeImage(before.image_path);
    return true;
  }

  async remove(id: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("client_observations")
      .delete()
      .eq("id", id)
      .select("id, image_path");
    if (error) throw error;
    for (const row of data) if (row.image_path) await this.removeImage(row.image_path);
    return data.length > 0;
  }

  private async removeImage(path: string): Promise<void> {
    await this.db.storage.from(OBSERVATION_IMAGES_BUCKET).remove([path]);
  }

  /** Batch signed URLs for note images -- same pattern as
   * ClientBillingService.signProofUrls. */
  async signImageUrls(paths: string[], expiresInSeconds = 3600): Promise<Map<string, string>> {
    if (paths.length === 0) return new Map();
    const { data, error } = await this.db.storage
      .from(OBSERVATION_IMAGES_BUCKET)
      .createSignedUrls(paths, expiresInSeconds);
    if (error) throw error;

    const signed = new Map<string, string>();
    for (const entry of data) {
      if (!entry.error && entry.signedUrl) signed.set(entry.path ?? "", entry.signedUrl);
    }
    signed.delete("");
    return signed;
  }

  /** Programs + recent check-ins the coach can link a note to (exercises use
   * the library's search action instead). */
  async linkOptions(clientId: string, locale: AppLocale): Promise<ObservationLinkOptions> {
    const [programs, checkins] = await Promise.all([
      this.db
        .from("programs")
        .select("id, name_ar, name_en")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      this.db
        .from("checkins")
        .select("id, checkin_date")
        .eq("client_id", clientId)
        .order("checkin_date", { ascending: false })
        .limit(CHECKIN_OPTIONS_LIMIT),
    ]);
    if (programs.error) throw programs.error;
    if (checkins.error) throw checkins.error;
    return {
      programs: programs.data.map((p) => ({ id: p.id, name: pickLocale(p, locale) })),
      checkins: checkins.data.map((c) => ({ id: c.id, date: c.checkin_date })),
    };
  }

  /** Display label per linked record, keyed `${type}:${id}`. A record that
   * was deleted or isn't visible to the coach is simply absent (the UI shows
   * "unavailable"). Check-in labels are the raw date. */
  async linkLabels(rows: Pick<Observation, "linked_type" | "linked_id">[], locale: AppLocale): Promise<Map<string, string>> {
    const ids: Record<ObservationLinkType, string[]> = { program: [], check_in: [], exercise: [] };
    for (const r of rows) {
      if (r.linked_type && r.linked_id) ids[r.linked_type as ObservationLinkType]?.push(r.linked_id);
    }

    const labels = new Map<string, string>();
    const [programs, checkins, exercises] = await Promise.all([
      ids.program.length
        ? this.db.from("programs").select("id, name_ar, name_en").in("id", ids.program)
        : null,
      ids.check_in.length ? this.db.from("checkins").select("id, checkin_date").in("id", ids.check_in) : null,
      ids.exercise.length
        ? this.db.from("exercises_visible").select("id, name_ar, name_en").in("id", ids.exercise)
        : null,
    ]);
    for (const p of programs?.data ?? []) labels.set(`program:${p.id}`, pickLocale(p, locale));
    for (const c of checkins?.data ?? []) labels.set(`check_in:${c.id}`, c.checkin_date);
    for (const e of exercises?.data ?? []) if (e.id) labels.set(`exercise:${e.id}`, pickLocale(e, locale));
    return labels;
  }
}
