import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

const PRIVATE_BUCKET = "progress-media";
const LINK_DAYS = 14;

export type ReviewStatus = "pending" | "approved" | "hidden";

export type ReviewItem = {
  id: string;
  /** Full name: this list is the coach's private dashboard. */
  clientName: string;
  /** What visitors see ("Sara M."). */
  displayName: string;
  rating: number;
  body: string;
  sharePhotos: boolean;
  status: ReviewStatus;
  createdAt: string;
};

/** sha256 hex, same as encode(extensions.digest(token,'sha256'),'hex') in SQL. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** 256 bits of randomness, URL-safe. Only its hash is stored. */
export const newToken = () => randomBytes(32).toString("base64url");

export class ReviewsService {
  constructor(private db: SupabaseClient<Database>) {}

  async list(coachId: string): Promise<ReviewItem[]> {
    const { data, error } = await this.db.from("reviews").select("*").eq("coach_id", coachId).order("created_at", { ascending: false });
    if (error) throw error;
    if (data.length === 0) return [];
    const clients = await this.db.from("clients").select("id, display_name").in("id", [...new Set(data.map((r) => r.client_id))]);
    if (clients.error) throw clients.error;
    return data.map((r) => ({
      id: r.id,
      clientName: clients.data.find((c) => c.id === r.client_id)?.display_name ?? "",
      displayName: r.display_name,
      rating: r.rating,
      body: r.body,
      sharePhotos: r.share_photos,
      status: r.status as ReviewStatus,
      createdAt: r.created_at,
    }));
  }

  /** The only thing a coach can change on a review. The database refuses
   * everything else (trigger + column grant). */
  async setStatus(coachId: string, reviewId: string, status: ReviewStatus): Promise<void> {
    const { error } = await this.db.from("reviews").update({ status }).eq("id", reviewId).eq("coach_id", coachId);
    if (error) throw error;
  }

  /** A personal, single-use link. Returns the plaintext token ONCE: only its
   * hash is stored, so it can't be shown again. */
  async createRequest(coachId: string, input: { clientId: string; cardId: string | null }): Promise<{ token: string; expiresAt: Date }> {
    const token = newToken();
    const expiresAt = new Date(Date.now() + LINK_DAYS * 24 * 60 * 60 * 1000);

    // Thumbnails for the review page's consent card, valid as long as the link.
    let preview: Json | null = null;
    if (input.cardId) {
      const card = await this.db.from("progress_cards").select("before_media_id, after_media_id").eq("id", input.cardId).eq("coach_id", coachId).single();
      if (card.error) throw card.error;
      const media = await this.db.from("media").select("id, storage_path").in("id", [card.data.before_media_id, card.data.after_media_id]);
      if (media.error) throw media.error;
      const paths = media.data.map((m) => m.storage_path);
      const signed = await this.db.storage.from(PRIVATE_BUCKET).createSignedUrls(paths, LINK_DAYS * 24 * 60 * 60);
      if (signed.error) throw signed.error;
      const urlOf = (id: string) => signed.data.find((s) => s.path === media.data.find((m) => m.id === id)?.storage_path)?.signedUrl ?? null;
      preview = { before: urlOf(card.data.before_media_id), after: urlOf(card.data.after_media_id) };
    }

    const { error } = await this.db.from("review_requests").insert({
      coach_id: coachId,
      client_id: input.clientId,
      card_id: input.cardId,
      token_hash: hashToken(token),
      expires_at: expiresAt.toISOString(),
      preview,
    });
    if (error) throw error;
    return { token, expiresAt };
  }
}
