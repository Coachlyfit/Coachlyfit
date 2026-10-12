import { describe, expect, it } from "vitest";
import { MarketingService } from "./marketing.service";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const row = (n: number, over: Record<string, unknown> = {}) => ({
  id: id(n),
  type: "final_cta",
  position: n,
  is_visible: true,
  content_ar: { title: "عنوان", subtitle: "وصف", cta: "ابدأ" },
  content_en: { title: "Title", subtitle: "Subtitle", cta: "Start" },
  settings: { background: "navy", image_position: "side" },
  ...over,
});

/** Just enough of the query builder for the calls the service makes: every
 * chain method returns the same thenable, which resolves to `result`. */
function fakeSupabase(results: Record<string, unknown>) {
  const calls: { table: string; op: string; payload?: unknown }[] = [];

  const db = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const result = { data: results[table] ?? null, error: null };
      for (const op of ["select", "eq", "order", "limit"]) chain[op] = () => chain;
      for (const op of ["insert", "update", "delete"]) {
        chain[op] = (payload?: unknown) => {
          calls.push({ table, op, payload });
          return chain;
        };
      }
      chain.maybeSingle = async () => result;
      chain.single = async () => result;
      chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
      return chain;
    },
    rpc: async (name: string, payload: unknown) => {
      calls.push({ table: name, op: "rpc", payload });
      return { error: null };
    },
  };

  return { db: db as never, calls };
}

describe("MarketingService.getPublished", () => {
  it("returns the snapshot's sections and drops the ones that don't parse", async () => {
    const { db } = fakeSupabase({
      marketing_page_versions: { snapshot: { sections: [row(1), row(2, { content_en: { title: 5 } }), row(3)] } },
    });
    const sections = await new MarketingService(db).getPublished("home");
    expect(sections.map((s) => s.id)).toEqual([id(1), id(3)]);
  });

  it("is empty when nothing was published or the snapshot is malformed", async () => {
    expect(await new MarketingService(fakeSupabase({}).db).getPublished("home")).toEqual([]);
    const { db } = fakeSupabase({ marketing_page_versions: { snapshot: "nope" } });
    expect(await new MarketingService(db).getPublished("home")).toEqual([]);
  });
});

describe("MarketingService.publish", () => {
  it("writes the whole draft, in page order, attributed to the publisher", async () => {
    const { db, calls } = fakeSupabase({ marketing_sections: [row(2), row(1, { is_visible: false })] });
    const issues = await new MarketingService(db).publish("page-1", "admin-1");

    expect(issues).toEqual([]);
    const insert = calls.find((c) => c.table === "marketing_page_versions" && c.op === "insert");
    expect(insert?.payload).toEqual({
      page_id: "page-1",
      published_by: "admin-1",
      snapshot: { sections: [row(1, { is_visible: false }), row(2)] },
    });
  });

  it("writes nothing when the draft has issues", async () => {
    const broken = row(1, { content_ar: { title: "", subtitle: "وصف", cta: "ابدأ" } });
    const { db, calls } = fakeSupabase({ marketing_sections: [broken] });
    const issues = await new MarketingService(db).publish("page-1", "admin-1");

    expect(issues).toEqual([{ code: "missing_translation", sectionId: id(1), path: "title", locale: "ar" }]);
    expect(calls).toEqual([]);
  });
});

describe("MarketingService.saveSection", () => {
  it("fails when the update touched no row", async () => {
    const { db } = fakeSupabase({ marketing_sections: [] });
    await expect(new MarketingService(db).saveSection(id(1), { is_visible: false })).rejects.toThrow();
  });
});
