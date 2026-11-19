import { afterEach, describe, expect, it, vi } from "vitest";
import { siteAlternates, siteUrl } from "./origin";

const site = (domain: string | null = null) => ({ domain, coach: { slug: "moathfit-online" } });

afterEach(() => vi.unstubAllEnvs());

describe("siteUrl", () => {
  it("custom domain wins", () => {
    expect(siteUrl(site("coachahmed.fit"))).toBe("https://coachahmed.fit/");
    expect(siteUrl(site("coachahmed.fit"), { lang: "en" })).toBe("https://coachahmed.fit/?lang=en");
    expect(siteUrl(site("coachahmed.fit"), { path: "/review/abc" })).toBe("https://coachahmed.fit/review/abc");
  });

  it("no root domain (e.g. on vercel.app): the site route on the app's own URL, never localhost", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://coachlyfit.vercel.app/");
    expect(siteUrl(site())).toBe("https://coachlyfit.vercel.app/ar/sites/moathfit-online");
    expect(siteUrl(site(), { lang: "en" })).toBe("https://coachlyfit.vercel.app/en/sites/moathfit-online");
    expect(siteUrl(site(), { path: "/review/abc" })).toBe("https://coachlyfit.vercel.app/ar/sites/moathfit-online/review/abc");
  });

  it("a real root domain: the wildcard subdomain", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "coachly.fit");
    expect(siteUrl(site())).toBe("https://moathfit-online.coachly.fit/");
    expect(siteUrl(site(), { path: "/review/abc", lang: "en" })).toBe("https://moathfit-online.coachly.fit/review/abc?lang=en");
  });

  it("explicit localhost root keeps the dev port for subdomain testing", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "localhost");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3100");
    expect(siteUrl(site())).toBe("http://moathfit-online.localhost:3100/");
  });
});

describe("siteAlternates", () => {
  it("canonical follows the page language; both languages are listed", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://coachlyfit.vercel.app");
    const a = siteAlternates(site(), "en");
    expect(a.canonical).toBe("https://coachlyfit.vercel.app/en/sites/moathfit-online");
    expect(a.languages.ar).toBe("https://coachlyfit.vercel.app/ar/sites/moathfit-online");
  });
});
