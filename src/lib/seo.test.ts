import { afterEach, describe, expect, it, vi } from "vitest";

async function load(siteUrl: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", siteUrl);
  return import("./seo");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildAlternates", () => {
  it("strips the trailing slash from the site URL", async () => {
    const { SITE_URL, buildAlternates } = await load("https://coachlyfit.app/");
    expect(SITE_URL).toBe("https://coachlyfit.app");
    expect(buildAlternates("ar").canonical).toBe("https://coachlyfit.app/ar");
  });

  it("points each locale at itself and x-default at the default locale", async () => {
    const { buildAlternates } = await load("https://coachlyfit.app");
    expect(buildAlternates("en", "/legal/terms")).toEqual({
      canonical: "https://coachlyfit.app/en/legal/terms",
      languages: {
        ar: "https://coachlyfit.app/ar/legal/terms",
        en: "https://coachlyfit.app/en/legal/terms",
        "x-default": "https://coachlyfit.app/ar/legal/terms",
      },
    });
  });
});
