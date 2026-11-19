import { describe, expect, it } from "vitest";
import { defaultDraft } from "./site-content";
import { NotPublishedError, PublishBlockedError, SitesService } from "./sites.service";

type Row = Record<string, unknown>;

/** Hand-rolled in-memory coach_sites + coaches tables. Only the chain shapes
 * SitesService uses: select/eq/maybeSingle/single, upsert, update/eq/select. */
function fakeSupabase(initial?: Row) {
  const state: { site: Row | null; coach: Row } = { site: initial ?? null, coach: { slug: "coach-1" } };
  const calls: string[] = [];

  const from = (table: string) => {
    let op: "select" | "update" | "upsert" = "select";
    let patch: Row = {};
    const builder = {
      select: () => builder,
      eq: () => builder,
      upsert: (row: Row) => {
        op = "upsert";
        calls.push("upsert");
        if (!state.site) state.site = { id: "s1", domain: null, domain_status: "none", is_published: false, published_content: null, published_at: null, updated_at: "t", ...row };
        return builder;
      },
      update: (p: Row) => {
        op = "update";
        patch = p;
        calls.push("update");
        return builder;
      },
      maybeSingle: async () => ({ data: table === "coaches" ? state.coach : state.site, error: null }),
      single: async () => {
        if (op === "update" && state.site) state.site = { ...state.site, ...patch };
        return { data: state.site, error: null };
      },
      then: (resolve: (v: unknown) => void) => {
        if (op === "update" && state.site) state.site = { ...state.site, ...patch };
        resolve({ data: null, error: null });
      },
    };
    return builder;
  };
  return { db: { from } as never, state, calls };
}

const readyDraft = () => {
  const d = defaultDraft();
  d.services[0].title = { ar: "", en: "1:1 coaching" };
  d.hero.whatsapp = "+201001234567";
  return d;
};

const site = (over: Row = {}): Row => ({
  id: "s1",
  domain: null,
  domain_status: "none",
  is_published: false,
  draft: defaultDraft(),
  published_content: null,
  published_at: null,
  updated_at: "t",
  ...over,
});

describe("SitesService", () => {
  it("creates an empty site on first visit", async () => {
    const { db, state } = fakeSupabase();
    const rec = await new SitesService(db).getOrCreate("c1");
    expect(state.site).not.toBeNull();
    expect(rec.published).toBeNull();
    expect(rec.draft.services).toHaveLength(1);
  });

  it("refuses to publish an incomplete draft", async () => {
    const { db } = fakeSupabase(site());
    await expect(new SitesService(db).publish("c1")).rejects.toBeInstanceOf(PublishBlockedError);
  });

  it("first publish copies the draft and turns the site live", async () => {
    const { db, state } = fakeSupabase(site({ draft: readyDraft() }));
    const rec = await new SitesService(db).publish("c1");
    expect(rec.isPublished).toBe(true);
    expect(rec.published?.services[0].title.en).toBe("1:1 coaching");
    expect(state.site?.published_at).toBeTruthy();
  });

  it("later publishes leave the live switch alone", async () => {
    const { db, state } = fakeSupabase(site({ draft: readyDraft(), published_at: "2026-01-01", is_published: false, published_content: readyDraft() }));
    await new SitesService(db).publish("c1");
    expect(state.site?.is_published).toBe(false);
  });

  it("discard resets the draft to what's live", async () => {
    const live = readyDraft();
    const edited = readyDraft();
    edited.hero.title = { ar: "", en: "unsaved idea" };
    const { db, state } = fakeSupabase(site({ draft: edited, published_content: live, published_at: "x" }));
    await new SitesService(db).discardDraft("c1");
    expect((state.site?.draft as { hero: { title: { en: string } } }).hero.title.en).toBe("");
  });

  it("can't go live before the first publish", async () => {
    const { db } = fakeSupabase(site());
    await expect(new SitesService(db).setLive("c1", true)).rejects.toBeInstanceOf(NotPublishedError);
    await expect(new SitesService(db).setLive("c1", false)).resolves.toBeUndefined();
  });

  it("lists cache keys: domain and slug", async () => {
    const { db } = fakeSupabase(site({ domain: "coachahmed.fit" }));
    expect(await new SitesService(db).siteKeys("c1")).toEqual(["coachahmed.fit", "coach-1"]);
  });
});
