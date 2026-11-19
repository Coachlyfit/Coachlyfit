import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const PRIVATE_BUCKET = "progress-media";
const PUBLIC_BUCKET = "site-results";
const SIGNED_URL_SECONDS = 60 * 60;

export type ConsentStatus = "pending" | "agreed" | "withdrawn";

export type ResultCard = {
  id: string;
  clientId: string;
  clientName: string;
  durationDays: number;
  weightDelta: number | null;
  createdAt: string;
  consent: { status: ConsentStatus; requestedAt: string; decidedAt: string | null; withdrawnAt: string | null };
  /** Live on the site right now (published AND still consented). */
  published: boolean;
  /** Short-lived signed URLs: the originals are private. */
  beforeUrl: string | null;
  afterUrl: string | null;
};

export type ClientPhoto = { id: string; url: string | null; createdAt: string; pose: string | null };

export class ConsentRequiredError extends Error {
  constructor() {
    super("consent_required");
  }
}

const extOf = (path: string) => path.split(".").pop()?.toLowerCase() || "jpg";

export class ResultsService {
  constructor(private db: SupabaseClient<Database>) {}

  /** The coach's before/after cards with consent state and publish state. */
  async list(coachId: string, siteId: string): Promise<ResultCard[]> {
    const cards = await this.db
      .from("progress_cards")
      .select("*")
      .eq("coach_id", coachId)
      .order("created_at", { ascending: false });
    if (cards.error) throw cards.error;
    if (cards.data.length === 0) return [];

    const cardIds = cards.data.map((c) => c.id);
    const mediaIds = cards.data.flatMap((c) => [c.before_media_id, c.after_media_id]);
    const clientIds = [...new Set(cards.data.map((c) => c.client_id))];

    const [consents, results, media, clients] = await Promise.all([
      this.db.from("card_consents").select("*").in("card_id", cardIds),
      this.db.from("site_results").select("card_id, is_published").eq("site_id", siteId).in("card_id", cardIds),
      this.db.from("media").select("id, storage_path").in("id", mediaIds),
      this.db.from("clients").select("id, display_name").in("id", clientIds),
    ]);
    for (const r of [consents, results, media, clients]) if (r.error) throw r.error;

    const pathById = new Map(media.data!.map((m) => [m.id, m.storage_path]));
    const signed = await this.sign([...pathById.values()]);

    return cards.data.map((c) => {
      const consent = consents.data!.find((x) => x.card_id === c.id);
      const status = (consent?.status ?? "pending") as ConsentStatus;
      return {
        id: c.id,
        clientId: c.client_id,
        clientName: clients.data!.find((x) => x.id === c.client_id)?.display_name ?? "",
        durationDays: c.duration_days,
        weightDelta: c.weight_delta,
        createdAt: c.created_at,
        consent: {
          status,
          requestedAt: consent?.requested_at ?? c.created_at,
          decidedAt: consent?.decided_at ?? null,
          withdrawnAt: consent?.withdrawn_at ?? null,
        },
        published: status === "agreed" && results.data!.some((r) => r.card_id === c.id && r.is_published),
        beforeUrl: signed.get(pathById.get(c.before_media_id) ?? "") ?? null,
        afterUrl: signed.get(pathById.get(c.after_media_id) ?? "") ?? null,
      };
    });
  }

  /** A client's progress photos, oldest first, for picking a before/after pair. */
  async clientPhotos(coachId: string, clientId: string): Promise<ClientPhoto[]> {
    const { data, error } = await this.db
      .from("media")
      .select("id, storage_path, created_at, pose")
      .eq("coach_id", coachId)
      .eq("client_id", clientId)
      .eq("kind", "photo")
      .order("created_at", { ascending: true });
    if (error) throw error;
    const signed = await this.sign(data.map((m) => m.storage_path));
    return data.map((m) => ({ id: m.id, url: signed.get(m.storage_path) ?? null, createdAt: m.created_at, pose: m.pose }));
  }

  /** Creates the card and sends the consent request in one step. */
  async createCard(
    coachId: string,
    input: { clientId: string; beforeMediaId: string; afterMediaId: string; durationDays: number; weightDelta: number | null }
  ): Promise<string> {
    const { data, error } = await this.db
      .from("progress_cards")
      .insert({
        coach_id: coachId,
        client_id: input.clientId,
        before_media_id: input.beforeMediaId,
        after_media_id: input.afterMediaId,
        duration_days: input.durationDays,
        weight_delta: input.weightDelta,
      })
      .select("id")
      .single();
    if (error) throw error;
    await this.requestConsent(data.id);
    return data.id;
  }

  /** (Re)send the consent request. A withdrawn card stays withdrawn. */
  async requestConsent(cardId: string): Promise<void> {
    const { error } = await this.db.rpc("request_card_consent", { p_card_id: cardId });
    if (error) throw error;
  }

  /** Show a card on the site (copying its two photos to the public bucket) or
   * take it down (deleting those copies). Publishing needs the client's
   * consent; the database enforces that too, so this check is for a clear error. */
  async setPublished(coachId: string, siteId: string, cardId: string, publish: boolean): Promise<void> {
    if (!publish) return this.unpublish(siteId, cardId);

    const card = await this.db.from("progress_cards").select("*").eq("id", cardId).eq("coach_id", coachId).single();
    if (card.error) throw card.error;
    const consent = await this.db.from("card_consents").select("status").eq("card_id", cardId).maybeSingle();
    if (consent.error) throw consent.error;
    if (consent.data?.status !== "agreed") throw new ConsentRequiredError();

    const existing = await this.db.from("site_results").select("is_published").eq("site_id", siteId).eq("card_id", cardId).maybeSingle();
    if (existing.data?.is_published) return;

    const media = await this.db.from("media").select("id, storage_path").in("id", [card.data.before_media_id, card.data.after_media_id]);
    if (media.error) throw media.error;
    const before = media.data.find((m) => m.id === card.data.before_media_id)!;
    const after = media.data.find((m) => m.id === card.data.after_media_id)!;

    const folder = `${coachId}/${cardId}`;
    const beforePath = `${folder}/${crypto.randomUUID()}-before.${extOf(before.storage_path)}`;
    const afterPath = `${folder}/${crypto.randomUUID()}-after.${extOf(after.storage_path)}`;
    await this.copy(before.storage_path, beforePath);
    try {
      await this.copy(after.storage_path, afterPath);
      const { error } = await this.db
        .from("site_results")
        .upsert({ site_id: siteId, card_id: cardId, is_published: true, before_path: beforePath, after_path: afterPath }, { onConflict: "site_id,card_id" });
      if (error) throw error;
    } catch (e) {
      // Don't leave public copies behind a failed publish.
      await this.db.storage.from(PUBLIC_BUCKET).remove([beforePath, afterPath]);
      throw e;
    }
  }

  private async unpublish(siteId: string, cardId: string): Promise<void> {
    const row = await this.db.from("site_results").select("before_path, after_path").eq("site_id", siteId).eq("card_id", cardId).maybeSingle();
    if (row.error) throw row.error;
    if (!row.data) return;
    const { error } = await this.db
      .from("site_results")
      .update({ is_published: false, before_path: null, after_path: null })
      .eq("site_id", siteId)
      .eq("card_id", cardId);
    if (error) throw error;
    const paths = [row.data.before_path, row.data.after_path].filter((p): p is string => !!p);
    if (paths.length > 0) await this.db.storage.from(PUBLIC_BUCKET).remove(paths);
  }

  /** private bucket → public bucket, through the coach's own session. */
  private async copy(from: string, to: string): Promise<void> {
    const file = await this.db.storage.from(PRIVATE_BUCKET).download(from);
    if (file.error) throw file.error;
    const up = await this.db.storage.from(PUBLIC_BUCKET).upload(to, file.data, { contentType: file.data.type || "image/jpeg" });
    if (up.error) throw up.error;
  }

  private async sign(paths: string[]): Promise<Map<string, string>> {
    if (paths.length === 0) return new Map();
    const { data, error } = await this.db.storage.from(PRIVATE_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (error) throw error;
    return new Map(data.flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
  }
}
