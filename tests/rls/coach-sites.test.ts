// Coach sites (20261126000001): what an anonymous visitor can see through
// get_public_site(), the consent gate on results, the review token flow, and
// the "reviews can't be edited" trigger.
import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";

type User = { userId: string; client: SupabaseClient<Database> };

const anon = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const newToken = () => randomBytes(24).toString("base64url");

let coach: User;
let other: User;
let clientId: string;
let siteId: string;
let cardAgreed: string;
let cardPending: string;
let domain: string;

async function makeCard(tag: string): Promise<string> {
  const media = await admin
    .from("media")
    .insert([
      { coach_id: coach.userId, client_id: clientId, storage_path: `${coach.userId}/${clientId}/${tag}-b.jpg`, kind: "photo" },
      { coach_id: coach.userId, client_id: clientId, storage_path: `${coach.userId}/${clientId}/${tag}-a.jpg`, kind: "photo" },
    ])
    .select("id");
  if (media.error) throw media.error;
  const card = await admin
    .from("progress_cards")
    .insert({
      coach_id: coach.userId,
      client_id: clientId,
      before_media_id: media.data[0].id,
      after_media_id: media.data[1].id,
      duration_days: 84,
      weight_delta: -6,
    })
    .select("id")
    .single();
  if (card.error) throw card.error;
  return card.data.id;
}

async function makeRequest(opts: { expired?: boolean; used?: boolean; cardId?: string } = {}) {
  const token = newToken();
  const row = await admin
    .from("review_requests")
    .insert({
      coach_id: coach.userId,
      client_id: clientId,
      card_id: opts.cardId ?? null,
      token_hash: sha(token),
      expires_at: opts.expired ? new Date(Date.now() - 1000).toISOString() : new Date(Date.now() + 864e5).toISOString(),
      used_at: opts.used ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (row.error) throw row.error;
  return { token, id: row.data.id };
}

beforeAll(async () => {
  [coach, other] = await Promise.all([
    createRlsUser("sites-coach", { role: "coach", full_name: "Coach Sites", business_name: "Sites Gym", locale: "ar" }),
    createRlsUser("sites-other", { role: "coach", full_name: "Other Coach", business_name: "Other Gym", locale: "ar" }),
  ]);

  const client = await admin
    .from("clients")
    .insert({ coach_id: coach.userId, display_name: "Sara Mahmoud" })
    .select("id")
    .single();
  if (client.error) throw client.error;
  clientId = client.data.id;

  domain = `rls-${Date.now()}.example.com`;
  const site = await admin
    .from("coach_sites")
    .insert({
      coach_id: coach.userId,
      domain,
      is_published: true,
      published_content: { hero: { title: "Hi" } },
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (site.error) throw site.error;
  siteId = site.data.id;

  cardAgreed = await makeCard("agreed");
  cardPending = await makeCard("pending");
  await admin.from("card_consents").insert([
    { card_id: cardAgreed, coach_id: coach.userId, client_id: clientId, status: "agreed" },
    { card_id: cardPending, coach_id: coach.userId, client_id: clientId, status: "pending" },
  ]);
  await admin.from("site_results").insert({
    site_id: siteId,
    card_id: cardAgreed,
    is_published: true,
    before_path: "x/before.jpg",
    after_path: "x/after.jpg",
  });
}, 60_000);

afterAll(async () => {
  await admin.from("coach_sites").delete().eq("id", siteId);
  await admin.from("clients").delete().eq("id", clientId);
});

describe("get_public_site", () => {
  it("returns only published + consented results and approved reviews, never client ids", async () => {
    const req = await makeRequest();
    const approved = await admin
      .from("reviews")
      .insert({ coach_id: coach.userId, client_id: clientId, request_id: req.id, rating: 5, body: "Great coaching, really loved it.", display_name: "Sara M.", status: "approved" })
      .select("id")
      .single();
    expect(approved.error).toBeNull();
    const req2 = await makeRequest();
    await admin
      .from("reviews")
      .insert({ coach_id: coach.userId, client_id: clientId, request_id: req2.id, rating: 4, body: "Pending review that must stay hidden.", display_name: "Sara M.", status: "pending" });

    // Publishing a card whose consent is still pending is refused by the
    // site_results trigger, for every role including service_role.
    const blocked = await admin.from("site_results").insert({
      site_id: siteId,
      card_id: cardPending,
      is_published: true,
      before_path: "x/b2.jpg",
      after_path: "x/a2.jpg",
    });
    expect(blocked.error).not.toBeNull();

    const { data, error } = await anon.rpc("get_public_site", { p_key: domain });
    expect(error).toBeNull();
    const site = data as unknown as {
      is_published: boolean;
      results: { id: string }[];
      reviews: { id: string; body: string }[];
    };
    expect(site.is_published).toBe(true);
    expect(site.results.map((r) => r.id)).toEqual([cardAgreed]);
    expect(site.reviews).toHaveLength(1);
    expect(site.reviews[0].body).toContain("Great coaching");

    const raw = JSON.stringify(data);
    expect(raw).not.toContain(clientId);
    expect(raw).not.toContain("client_id");
  });

  it("serves no content while unpublished", async () => {
    await admin.from("coach_sites").update({ is_published: false }).eq("id", siteId);
    const { data } = await anon.rpc("get_public_site", { p_key: domain });
    const site = data as unknown as { is_published: boolean; results?: unknown; content?: unknown };
    expect(site.is_published).toBe(false);
    expect(site.results).toBeUndefined();
    expect(site.content).toBeUndefined();
    await admin.from("coach_sites").update({ is_published: true }).eq("id", siteId);
  });

  it("unknown domain returns null", async () => {
    const { data, error } = await anon.rpc("get_public_site", { p_key: "nope.example.org" });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});

describe("card consent", () => {
  it("withdrawing consent unpublishes the result and queues its photos for deletion", async () => {
    const card = await makeCard("withdraw");
    await admin.from("card_consents").insert({ card_id: card, coach_id: coach.userId, client_id: clientId, status: "agreed" });
    await admin.from("site_results").insert({ site_id: siteId, card_id: card, is_published: true, before_path: "w/b.jpg", after_path: "w/a.jpg" });

    await admin.from("card_consents").update({ status: "withdrawn", withdrawn_at: new Date().toISOString() }).eq("card_id", card);

    const row = await admin.from("site_results").select("is_published, before_path, after_path, purge_paths").eq("card_id", card).single();
    expect(row.data?.is_published).toBe(false);
    expect(row.data?.before_path).toBeNull();
    expect(row.data?.purge_paths).toEqual(["w/b.jpg", "w/a.jpg"]);

    const { data } = await anon.rpc("get_public_site", { p_key: domain });
    const ids = (data as unknown as { results: { id: string }[] }).results.map((r) => r.id);
    expect(ids).not.toContain(card);
  });

  it("another coach cannot publish this coach's card", async () => {
    const res = await other.client.from("site_results").insert({ site_id: siteId, card_id: cardAgreed, is_published: false });
    expect(res.error).not.toBeNull();
  });
});

describe("reviews", () => {
  it("coach can change status but never the words", async () => {
    const req = await makeRequest();
    const review = await admin
      .from("reviews")
      .insert({ coach_id: coach.userId, client_id: clientId, request_id: req.id, rating: 5, body: "Original words from the client here.", display_name: "Sara M." })
      .select("id")
      .single();
    const id = review.data!.id;

    const ok = await coach.client.from("reviews").update({ status: "approved" }).eq("id", id).select("status").single();
    expect(ok.data?.status).toBe("approved");

    const edit = await coach.client.from("reviews").update({ body: "Edited by the coach to say something." }).eq("id", id);
    expect(edit.error).not.toBeNull();

    // The trigger holds even for the service role (no grant to fall back on).
    const viaAdmin = await admin.from("reviews").update({ body: "Edited by service role to say something." }).eq("id", id);
    expect(viaAdmin.error?.code).toBe("42501");

    const after = await admin.from("reviews").select("body").eq("id", id).single();
    expect(after.data?.body).toBe("Original words from the client here.");
  });

  it("a coach cannot read another coach's reviews", async () => {
    const res = await other.client.from("reviews").select("id");
    expect(res.data ?? []).toHaveLength(0);
  });
});

describe("review token flow", () => {
  it("submits once, builds a display name, and applies consent", async () => {
    const { token } = await makeRequest({ cardId: cardPending });
    const body = "Lost 6kg and learned a lot, thank you.";

    const first = await anon.rpc("submit_review", { p_token: token, p_rating: 5, p_body: body, p_first_name: "Sara", p_share_photos: true });
    expect(first.data).toMatchObject({ ok: true, display_name: "Sara M.", share_photos: true });

    const consent = await admin.from("card_consents").select("status").eq("card_id", cardPending).single();
    expect(consent.data?.status).toBe("agreed");

    const again = await anon.rpc("submit_review", { p_token: token, p_rating: 5, p_body: body, p_first_name: "Sara", p_share_photos: false });
    expect(again.data).toMatchObject({ ok: false, error: "invalid_link" });
  });

  it("rejects expired, used and unknown tokens with the same generic error", async () => {
    const expired = await makeRequest({ expired: true });
    const used = await makeRequest({ used: true });
    const args = { p_rating: 5, p_body: "A perfectly fine review body.", p_first_name: "Sara", p_share_photos: false };

    for (const token of [expired.token, used.token, newToken()]) {
      const res = await anon.rpc("submit_review", { p_token: token, ...args });
      expect(res.data).toMatchObject({ ok: false, error: "invalid_link" });
    }
    const reviews = await admin.from("reviews").select("id").in("request_id", [expired.id, used.id]);
    expect(reviews.data).toHaveLength(0);
  });

  it("rejects too-short bodies", async () => {
    const { token } = await makeRequest();
    const res = await anon.rpc("submit_review", { p_token: token, p_rating: 5, p_body: "short", p_first_name: "Sara", p_share_photos: false });
    expect(res.data).toMatchObject({ ok: false, error: "invalid_input" });
  });

  it("withdraw_consent works on a used token and unpublishes", async () => {
    const card = await makeCard("token-withdraw");
    await admin.from("card_consents").insert({ card_id: card, coach_id: coach.userId, client_id: clientId, status: "agreed" });
    await admin.from("site_results").insert({ site_id: siteId, card_id: card, is_published: true, before_path: "t/b.jpg", after_path: "t/a.jpg" });
    const { token } = await makeRequest({ used: true, cardId: card });

    const res = await anon.rpc("withdraw_consent", { p_token: token });
    expect(res.data).toBe(1);

    const row = await admin.from("site_results").select("is_published").eq("card_id", card).single();
    expect(row.data?.is_published).toBe(false);

    const bad = await anon.rpc("withdraw_consent", { p_token: newToken() });
    expect(bad.data).toBe(-1);
  });

  it("stores only a hash of the token", async () => {
    const { token, id } = await makeRequest();
    const row = await admin.from("review_requests").select("token_hash").eq("id", id).single();
    expect(row.data?.token_hash).toBe(sha(token));
    expect(row.data?.token_hash).not.toContain(token);
  });
});
