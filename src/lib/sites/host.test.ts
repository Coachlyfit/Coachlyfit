import { describe, expect, it } from "vitest";
import { isPlatformHost, pickSiteLang, servesSite, siteCandidate } from "./host";

describe("pickSiteLang", () => {
  it("?lang wins", () => {
    expect(pickSiteLang("en", "ar")).toBe("en");
    expect(pickSiteLang("AR", "en")).toBe("ar");
  });

  it("falls back to Accept-Language by weight", () => {
    expect(pickSiteLang(null, "en-US,en;q=0.9,ar;q=0.8")).toBe("en");
    expect(pickSiteLang(null, "fr;q=1.0, ar;q=0.5, en;q=0.7")).toBe("en");
    expect(pickSiteLang(null, "ar-EG,ar;q=0.9")).toBe("ar");
  });

  it("defaults to Arabic", () => {
    expect(pickSiteLang(null, null)).toBe("ar");
    expect(pickSiteLang("xx", "fr,de")).toBe("ar");
    expect(pickSiteLang(null, "en;q=0")).toBe("ar");
  });
});

describe("isPlatformHost", () => {
  const root = "coachly.fit";
  it("recognizes the platform's own hosts", () => {
    for (const h of ["coachly.fit", "www.coachly.fit", "localhost", "app-git-x.vercel.app", "10.0.0.5", ""]) {
      expect(isPlatformHost(h, root)).toBe(true);
    }
  });
  it("treats anything else as a possible custom domain", () => {
    expect(isPlatformHost("coachahmed.fit", root)).toBe(false);
  });
});

describe("siteCandidate / servesSite", () => {
  const base = { rootDomain: "coachly.fit" };

  it("custom domain: every path is a candidate", () => {
    const c = siteCandidate({ ...base, hostname: "coachahmed.fit", slug: null, pathname: "/anything" });
    expect(c).toEqual({ key: "coachahmed.fit", custom: true });
    expect(servesSite(c!, "unpublished")).toBe(true);
    expect(servesSite(c!, "none")).toBe(false);
  });

  it("subdomain: only the root and review links, and only when published", () => {
    expect(siteCandidate({ ...base, hostname: "ahmed.coachly.fit", slug: "ahmed", pathname: "/ar/login" })).toBeNull();
    const root = siteCandidate({ ...base, hostname: "ahmed.coachly.fit", slug: "ahmed", pathname: "/" });
    const review = siteCandidate({ ...base, hostname: "ahmed.coachly.fit", slug: "ahmed", pathname: "/review/abc" });
    expect(root).toEqual({ key: "ahmed", custom: false });
    expect(review?.key).toBe("ahmed");
    expect(servesSite(root!, "published")).toBe(true);
    expect(servesSite(root!, "unpublished")).toBe(false);
  });

  it("platform host is never a candidate", () => {
    expect(siteCandidate({ ...base, hostname: "coachly.fit", slug: null, pathname: "/" })).toBeNull();
  });
});
