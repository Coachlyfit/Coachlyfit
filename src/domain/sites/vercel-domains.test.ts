import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeDomain, VercelDomains } from "./vercel-domains";

describe("normalizeDomain", () => {
  it("accepts hosts and strips scheme, path and www", () => {
    expect(normalizeDomain("CoachAhmed.fit")).toBe("coachahmed.fit");
    expect(normalizeDomain("https://www.coachahmed.fit/about")).toBe("coachahmed.fit");
    expect(normalizeDomain("book.coachahmed.fit")).toBe("book.coachahmed.fit");
  });

  it("rejects things that aren't a domain", () => {
    for (const bad of ["", "localhost", "coach ahmed.fit", "-bad.com", "a..com", "coachahmed"]) {
      expect(normalizeDomain(bad), bad).toBeNull();
    }
  });
});

describe("VercelDomains", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is unconfigured without a token and project", () => {
    expect(new VercelDomains({}).isConfigured()).toBe(false);
    expect(new VercelDomains({ token: "t", projectId: "p" }).isConfigured()).toBe(true);
  });

  it("reports connected only when verified AND DNS is right", async () => {
    const respond = (body: object) => ({ ok: true, status: 200, json: async () => body });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(respond({ verified: true }))
        .mockResolvedValueOnce(respond({ misconfigured: false }))
    );
    const s = await new VercelDomains({ token: "t", projectId: "p" }).status("coachahmed.fit");
    expect(s.state).toBe("connected");
    expect(s.records).toEqual([]);
  });

  it("stays pending and lists the A record for a misconfigured apex domain", async () => {
    const respond = (body: object) => ({ ok: true, status: 200, json: async () => body });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(respond({ verified: true }))
        .mockResolvedValueOnce(respond({ misconfigured: true }))
    );
    const s = await new VercelDomains({ token: "t", projectId: "p" }).status("coachahmed.fit");
    expect(s.state).toBe("pending");
    expect(s.records).toEqual([{ type: "A", name: "@", value: "76.76.21.21" }]);
  });

  it("is an error when the domain isn't attached to the project", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) }));
    expect((await new VercelDomains({ token: "t", projectId: "p" }).status("x.fit")).state).toBe("error");
  });
});
