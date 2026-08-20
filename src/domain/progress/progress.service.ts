import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Checkin = Database["public"]["Tables"]["checkins"]["Row"];
type BodyMetric = Database["public"]["Tables"]["body_metrics"]["Row"];
type Media = Database["public"]["Tables"]["media"]["Row"];

export type CheckinInput = {
  checkin_date: string;
  weight?: number;
  mood?: number;
  energy?: number;
  adherence?: number;
  sleep_hours?: number;
  notes?: string;
};

export type BodyMetricInput = {
  taken_on: string;
  metric: string;
  value: number;
  unit: string;
};

export type MediaInput = {
  storage_path: string;
  kind: "photo" | "video" | "file";
  checkin_id?: string | null;
  pose?: "front" | "side" | "back" | null;
};

/** Path convention enforced by the progress_media_* storage policies:
 * `coach_id/client_id/file`. Shared so callers never hand-roll the string. */
export const PROGRESS_BUCKET = "progress-media";

/** Daily check-ins (one per client per day — see the unique(client_id,
 * checkin_date) constraint), body metrics (long format: one row per
 * measurement, so a new metric never needs a schema change), and progress
 * media (photos in the private progress-media bucket). */
export class ProgressService {
  constructor(private db: SupabaseClient<Database>) {}

  async submitCheckin(coachId: string, clientId: string, input: CheckinInput): Promise<Checkin> {
    const { data, error } = await this.db
      .from("checkins")
      .upsert(
        { coach_id: coachId, client_id: clientId, ...input },
        { onConflict: "client_id,checkin_date" }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async getCheckin(clientId: string, date: string): Promise<Checkin | null> {
    const { data, error } = await this.db
      .from("checkins")
      .select("*")
      .eq("client_id", clientId)
      .eq("checkin_date", date)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /** `since` is an inclusive ISO date (YYYY-MM-DD); omit for full history.
   * No LIMIT — the previous `.order(asc).limit(90)` returned the OLDEST 90
   * rows once a client passed 90 check-ins, freezing every chart in the
   * past. A date bound is what callers actually want and can't truncate
   * from the wrong end. */
  async listCheckins(clientId: string, since?: string): Promise<Checkin[]> {
    let q = this.db.from("checkins").select("*").eq("client_id", clientId);
    if (since) q = q.gte("checkin_date", since);
    const { data, error } = await q.order("checkin_date", { ascending: true });
    if (error) throw error;
    return data;
  }

  async addBodyMetric(coachId: string, clientId: string, input: BodyMetricInput): Promise<BodyMetric> {
    const { data, error } = await this.db
      .from("body_metrics")
      .insert({ coach_id: coachId, client_id: clientId, ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** All body metrics for a client, grouped by metric name in one query —
   * replaces the old listDistinctMetrics() + one listBodyMetrics() per name
   * N+1 fan-out. A Map, not a plain object: `metric` is user-supplied free
   * text (up to 50 chars, no allowlist), and a metric literally named
   * `__proto__` would corrupt an object accumulator. */
  async listBodyMetricsGrouped(clientId: string, since?: string): Promise<Map<string, BodyMetric[]>> {
    let q = this.db.from("body_metrics").select("*").eq("client_id", clientId);
    if (since) q = q.gte("taken_on", since);
    const { data, error } = await q.order("taken_on", { ascending: true });
    if (error) throw error;

    const grouped = new Map<string, BodyMetric[]>();
    for (const row of data) {
      const bucket = grouped.get(row.metric);
      if (bucket) bucket.push(row);
      else grouped.set(row.metric, [row]);
    }
    return grouped;
  }

  /** RLS grants the coach SELECT-only on media (client_own is FOR ALL,
   * coach_read is FOR SELECT) — a coach editing/adding a client's
   * self-reported progress data would be misleading, same as checkins and
   * body_metrics. This method only ever succeeds when called as the client. */
  async addMedia(coachId: string, clientId: string, input: MediaInput): Promise<Media> {
    const { data, error } = await this.db
      .from("media")
      .insert({ coach_id: coachId, client_id: clientId, ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Newest first — a photo timeline reads most-recent-first, unlike the
   * charts which read oldest-first. `since` filters on created_at; media
   * has no measurement date of its own. */
  async listMedia(clientId: string, kind?: Media["kind"], since?: string): Promise<Media[]> {
    let q = this.db.from("media").select("*").eq("client_id", clientId);
    if (kind) q = q.eq("kind", kind);
    if (since) q = q.gte("created_at", `${since}T00:00:00Z`);
    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  /** Signs a batch of storage paths for browser display — the bucket is
   * private, so there is no public URL to fall back to. Paths that fail to
   * sign are dropped from the result rather than throwing, so one dead
   * object can't blank an entire gallery. */
  async signMediaUrls(paths: string[], expiresInSeconds = 3600): Promise<Map<string, string>> {
    if (paths.length === 0) return new Map();

    const { data, error } = await this.db.storage
      .from(PROGRESS_BUCKET)
      .createSignedUrls(paths, expiresInSeconds);
    if (error) throw error;

    const signed = new Map<string, string>();
    for (const entry of data) {
      if (!entry.error && entry.signedUrl) signed.set(entry.path ?? "", entry.signedUrl);
    }
    signed.delete("");
    return signed;
  }
}
