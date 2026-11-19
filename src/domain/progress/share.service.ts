import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { ProgressService } from "./progress.service";
import { weeksBetween, weightDelta, adherenceInWindow, type ShareCheckin } from "./share-stats";

export const SHARE_POSES = ["front", "side", "back"] as const;
export type SharePose = (typeof SHARE_POSES)[number];
export type PoseCounts = Record<SharePose, number>;

export type SharePhoto = { id: string; url: string; createdAt: string };
export type SharePair = { before: SharePhoto; after: SharePhoto; weeks: number };

const PHOTO_COLUMNS = "id, storage_path, created_at";

/** Reads for the "Share progress" card. Runs on the browser client: RLS (coach
 * SELECT on media + the progress-media storage policy) is the boundary, no
 * service role. */
export class ShareProgressService {
  constructor(private db: SupabaseClient<Database>) {}

  /** Photos per pose. Photos without a pose are not usable for a same-pose
   * comparison and are not counted. */
  async poseCounts(clientId: string): Promise<PoseCounts> {
    const { data, error } = await this.db
      .from("media")
      .select("pose")
      .eq("client_id", clientId)
      .eq("kind", "photo")
      .in("pose", [...SHARE_POSES]);
    if (error) throw error;

    const counts: PoseCounts = { front: 0, side: 0, back: 0 };
    for (const row of data ?? []) {
      if (row.pose && row.pose in counts) counts[row.pose as SharePose]++;
    }
    return counts;
  }

  /** Oldest and newest photo of one pose, signed. null when the pose has fewer
   * than two photos (same row twice is not a comparison) or signing failed. */
  async photoPair(clientId: string, pose: SharePose): Promise<SharePair | null> {
    const edge = (ascending: boolean) =>
      this.db
        .from("media")
        .select(PHOTO_COLUMNS)
        .eq("client_id", clientId)
        .eq("kind", "photo")
        .eq("pose", pose)
        .order("created_at", { ascending })
        .limit(1)
        .maybeSingle();

    const [oldest, newest] = await Promise.all([edge(true), edge(false)]);
    if (oldest.error) throw oldest.error;
    if (newest.error) throw newest.error;
    const a = oldest.data;
    const b = newest.data;
    if (!a || !b || a.id === b.id) return null;

    const signed = await new ProgressService(this.db).signMediaUrls([a.storage_path, b.storage_path]);
    const aUrl = signed.get(a.storage_path);
    const bUrl = signed.get(b.storage_path);
    if (!aUrl || !bUrl) return null;

    return {
      before: { id: a.id, url: aUrl, createdAt: a.created_at },
      after: { id: b.id, url: bUrl, createdAt: b.created_at },
      weeks: weeksBetween(a.created_at, b.created_at),
    };
  }

  /** Weight change and mean adherence between the two photos. */
  async windowStats(clientId: string, fromISO: string, toISO: string) {
    const { data, error } = await this.db
      .from("checkins")
      .select("checkin_date, weight, adherence")
      .eq("client_id", clientId)
      .gte("checkin_date", fromISO.slice(0, 10))
      .lte("checkin_date", toISO.slice(0, 10))
      .order("checkin_date", { ascending: true });
    if (error) throw error;

    const rows: ShareCheckin[] = data ?? [];
    return {
      weightDelta: weightDelta(rows, fromISO, toISO),
      adherence: adherenceInWindow(rows, fromISO, toISO),
    };
  }
}
