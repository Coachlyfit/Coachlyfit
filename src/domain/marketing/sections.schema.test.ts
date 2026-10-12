import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  contentSchemas,
  emptyContent,
  flattenText,
  sectionSchema,
  settingsSchema,
  DEFAULT_BACKGROUND,
  SECTION_TYPES,
} from "./sections.schema";

const ID = "3f1d0c52-6f0b-4b7e-9a51-2f6f3f0f6f10";

describe("content schemas", () => {
  it.each(SECTION_TYPES)("accepts the empty content of %s", (type) => {
    expect(contentSchemas[type].safeParse(emptyContent(type)).success).toBe(true);
  });

  it("hands out a fresh empty content each time", () => {
    const first = emptyContent("faq");
    first.items.push({ q: "x", a: "y" });
    expect(emptyContent("faq").items).toHaveLength(1);
  });

  it("rejects content of the wrong shape", () => {
    expect(contentSchemas.hero.safeParse({ title: "only a title" }).success).toBe(false);
    expect(contentSchemas.faq.safeParse({ title: "t", items: [{ q: "no answer" }] }).success).toBe(false);
    expect(contentSchemas.features.safeParse({ rows: [{ eyebrow: "", title: "", body: "", bullets: ["bare"] }] }).success).toBe(false);
    expect(contentSchemas.stats.safeParse({ items: "not a list" }).success).toBe(false);
  });

  it("caps text length and list size", () => {
    expect(contentSchemas.final_cta.safeParse({ title: "x".repeat(1001), subtitle: "", cta: "" }).success).toBe(false);
    const items = Array.from({ length: 13 }, () => ({ q: "", a: "" }));
    expect(contentSchemas.faq.safeParse({ title: "", items }).success).toBe(false);
  });
});

describe("settings schema", () => {
  it("accepts the three backgrounds and two image positions", () => {
    expect(settingsSchema.safeParse({ background: "navy", image_position: "below", image_path: "home/a.png" }).success).toBe(true);
    expect(settingsSchema.safeParse({ background: "pink", image_position: "side" }).success).toBe(false);
    expect(settingsSchema.safeParse({ background: "white", image_position: "above" }).success).toBe(false);
  });
});

describe("section schema", () => {
  const section = (type: string, content: unknown) => ({
    id: ID,
    type,
    position: 1,
    is_visible: true,
    content_ar: content,
    content_en: content,
    settings: { background: "white", image_position: "side" },
  });

  it("checks content against the section's own type", () => {
    expect(sectionSchema.safeParse(section("faq", emptyContent("faq"))).success).toBe(true);
    expect(sectionSchema.safeParse(section("faq", emptyContent("hero"))).success).toBe(false);
    expect(sectionSchema.safeParse(section("carousel", {})).success).toBe(false);
  });

  // The seed is generated from the message files; this keeps the migration and
  // the schemas from drifting apart without anyone noticing until it's applied.
  it("accepts every section seeded by the migration", () => {
    const sql = readFileSync("supabase/migrations/20261019000001_marketing_cms.sql", "utf8");
    const json = String.raw`\$j\$(.*?)\$j\$::jsonb`;
    const rows = [...sql.matchAll(new RegExp(String.raw`\('(\w+)', (\d+), ${json}, ${json}, ${json}\)`, "g"))];
    expect(rows).toHaveLength(10);

    for (const [, type, position, ar, en, settings] of rows) {
      const parsed = sectionSchema.safeParse({
        id: ID,
        type,
        position: Number(position),
        is_visible: true,
        content_ar: JSON.parse(ar),
        content_en: JSON.parse(en),
        settings: JSON.parse(settings),
      });
      expect(parsed.error?.issues ?? [], type).toEqual([]);
      expect(JSON.parse(settings).background, type).toBe(DEFAULT_BACKGROUND[type as keyof typeof DEFAULT_BACKGROUND]);
    }
  });
});

describe("flattenText", () => {
  it("keys every string by its path", () => {
    expect(flattenText({ title: "T", items: [{ q: "Q", a: "A" }] })).toEqual({
      title: "T",
      "items.0.q": "Q",
      "items.0.a": "A",
    });
    expect(flattenText({})).toEqual({});
  });
});
