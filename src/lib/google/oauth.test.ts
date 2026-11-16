import { describe, expect, it } from "vitest";
import { GoogleApiError } from "./errors";
import { buildAuthUrl, emailFromIdToken, exchangeCode, GOOGLE_SCOPES, newState, refreshAccessToken, statesMatch } from "./oauth";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("buildAuthUrl", () => {
  const url = new URL(buildAuthUrl({ clientId: "cid", redirectUri: "https://app.test/api/google/callback", state: "st4te" }));

  it("asks for offline access with a consent screen and carries the CSRF state", () => {
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("st4te");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.test/api/google/callback");
  });

  it("requests only the narrow calendar scopes, never full calendar access", () => {
    const scopes = url.searchParams.get("scope")!.split(" ");
    expect(scopes).toEqual([...GOOGLE_SCOPES]);
    expect(scopes).toContain("https://www.googleapis.com/auth/calendar.app.created");
    expect(scopes).toContain("https://www.googleapis.com/auth/calendar.freebusy");
    expect(scopes).not.toContain("https://www.googleapis.com/auth/calendar");
    expect(scopes).not.toContain("https://www.googleapis.com/auth/calendar.events");
  });
});

describe("state", () => {
  it("is random and compared exactly", () => {
    const a = newState();
    expect(a).not.toBe(newState());
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(statesMatch(a, a)).toBe(true);
    expect(statesMatch(a, a + "x")).toBe(false);
    expect(statesMatch(a, newState())).toBe(false);
    expect(statesMatch(undefined, a)).toBe(false);
    expect(statesMatch(a, null)).toBe(false);
  });
});

describe("token endpoint", () => {
  it("exchanges a code, sending the client credentials in the body", async () => {
    let sent: URLSearchParams | undefined;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = init.body as URLSearchParams;
      return json({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "a b" });
    }) as unknown as typeof fetch;
    const tokens = await exchangeCode("the-code", fetchImpl);
    expect(tokens.refresh_token).toBe("rt");
    expect(sent?.get("grant_type")).toBe("authorization_code");
    expect(sent?.get("code")).toBe("the-code");
  });

  it("surfaces invalid_grant as an auth-revoked error", async () => {
    const fetchImpl = (async () => json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400)) as unknown as typeof fetch;
    const error = await refreshAccessToken("rt", fetchImpl).catch((e) => e);
    expect(error).toBeInstanceOf(GoogleApiError);
    expect(error.isAuthRevoked).toBe(true);
    // The description (which may echo details) is not kept.
    expect(error.message).toBe("Google API error 400 invalid_grant");
  });

  it("reads Calendar-style errors and Retry-After", async () => {
    const fetchImpl = (async () =>
      json({ error: { errors: [{ reason: "rateLimitExceeded" }] } }, 403, { "Retry-After": "120" })) as unknown as typeof fetch;
    const error = await refreshAccessToken("rt", fetchImpl).catch((e) => e);
    expect(error.isRateLimit).toBe(true);
    expect(error.retryAfterMs).toBe(120_000);
  });
});

describe("emailFromIdToken", () => {
  const token = (payload: object) => `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;
  it("reads the email claim and shrugs off garbage", () => {
    expect(emailFromIdToken(token({ email: "coach@example.com" }))).toBe("coach@example.com");
    expect(emailFromIdToken(token({ sub: "1" }))).toBeNull();
    expect(emailFromIdToken("not-a-jwt")).toBeNull();
    expect(emailFromIdToken(undefined)).toBeNull();
  });
});
