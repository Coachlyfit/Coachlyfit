import { describe, expect, it } from "vitest";
import { durationParts, publicStorageUrl, signedKg, toSiteView, type PublicSiteRow } from "./public-site";

const row: PublicSiteRow = {
  is_published: true,
  domain: "coachahmed.fit",
  content: { hero: { title: "Hi" }, about: { photoPath: "c1/me.jpg" } },
  coach: { business_name: "Coach Ahmed", slug: "coach-1", logo_path: "c1/logo.png", brand_primary: "#1d4ed8", brand_accent: null },
  results: [{ id: "r1", before_path: "c1/r1/b.jpg", after_path: "c1/r1/a.jpg", duration_days: 84, weight_delta: -6 }],
  reviews: [{ id: "v1", rating: 5, body: "Great", display_name: "Sara M.", created_at: "2026-01-01" }],
};

describe("toSiteView", () => {
  const v = toSiteView(row, "https://x.supabase.co/", "en");

  it("resolves public image URLs", () => {
    expect(v.logoUrl).toBe("https://x.supabase.co/storage/v1/object/public/coach-logos/c1/logo.png");
    expect(v.photoUrl).toBe("https://x.supabase.co/storage/v1/object/public/coach-site/c1/me.jpg");
    expect(v.results[0].beforeUrl).toContain("/site-results/c1/r1/b.jpg");
  });

  it("fills missing content from defaults and guards colors", () => {
    expect(v.content.hero.title).toBe("Hi");
    expect(v.content.services).toHaveLength(1);
    expect(v.colors.primary).toBe("#1d4ed8");
  });

  it("maps reviews without any client identity", () => {
    expect(v.reviews).toEqual([{ id: "v1", name: "Sara M.", rating: 5, text: "Great" }]);
  });
});

describe("helpers", () => {
  it("encodes path segments but keeps slashes", () => {
    expect(publicStorageUrl("https://x.co", "coach-site", "a b/ü.jpg")).toBe("https://x.co/storage/v1/object/public/coach-site/a%20b/%C3%BC.jpg");
  });

  it("duration: weeks from 2 weeks, else days", () => {
    expect(durationParts(84)).toEqual({ unit: "weeks", n: 12 });
    expect(durationParts(10)).toEqual({ unit: "days", n: 10 });
  });

  it("signed kg uses a real minus and hides zero", () => {
    expect(signedKg(-6)).toBe("−6");
    expect(signedKg(3)).toBe("+3");
    expect(signedKg(-2.5)).toBe("−2.5");
    expect(signedKg(0)).toBeNull();
    expect(signedKg(null)).toBeNull();
  });
});

describe("toSiteView: one site, two languages", () => {
  const bilingual: PublicSiteRow = {
    ...row,
    content: {
      hero: { title: { ar: "مدرب لياقة", en: "Fitness coach" }, intro: { ar: "", en: "I help you" }, mainButton: "whatsapp", whatsapp: "", secondaryLabel: { ar: "", en: "" } },
      services: [{ title: { ar: "تدريب", en: "Coaching" }, description: { ar: "", en: "" }, price: 1500, unit: "month", contactForPrice: false }],
    },
  };

  it("shows each language's own text", () => {
    expect(toSiteView(bilingual, "https://x.co", "ar").content.hero.title).toBe("مدرب لياقة");
    expect(toSiteView(bilingual, "https://x.co", "en").content.hero.title).toBe("Fitness coach");
    expect(toSiteView(bilingual, "https://x.co", "ar").content.services[0].title).toBe("تدريب");
    expect(toSiteView(bilingual, "https://x.co", "en").content.services[0].title).toBe("Coaching");
  });

  it("falls back to the other language only where one is empty", () => {
    expect(toSiteView(bilingual, "https://x.co", "ar").content.hero.intro).toBe("I help you");
  });
});
