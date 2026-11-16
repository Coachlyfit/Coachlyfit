import { randomBytes, timingSafeEqual } from "node:crypto";
import { GoogleApiError, readGoogleError } from "./errors";

// Least privilege, as specified: events only on calendars this app created
// (calendar.app.created) and free/busy answers (calendar.freebusy). Never full
// calendar access. `openid email` are identity-only (no calendar data); they
// exist so Settings can show which Google account is connected.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.app.created",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "openid",
  "email",
] as const;

export const STATE_COOKIE = "google_oauth_state";
export const STATE_TTL_SECONDS = 600;

type Fetch = typeof fetch;

export function redirectUri(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/google/callback`;
}

/** Random, single-use CSRF value: kept in a short-lived httpOnly cookie and
 * echoed back by Google in `state`. */
export function newState(): string {
  return randomBytes(32).toString("base64url");
}

export function statesMatch(cookieValue: string | undefined, queryValue: string | null): boolean {
  if (!cookieValue || !queryValue) return false;
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(queryValue);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function buildAuthUrl(args: { clientId: string; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    // offline + consent: Google only returns a refresh token on a consent
    // screen, and only when asked for offline access.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state: args.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
};

async function tokenRequest(body: Record<string, string>, fetchImpl: Fetch): Promise<TokenResponse> {
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      ...body,
    }),
  });
  if (!response.ok) throw await readGoogleError(response);
  return (await response.json()) as TokenResponse;
}

export function exchangeCode(code: string, fetchImpl: Fetch = fetch) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() }, fetchImpl);
}

export async function refreshAccessToken(refreshToken: string, fetchImpl: Fetch = fetch): Promise<string> {
  const token = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl);
  return token.access_token;
}

/** Best effort: a token Google already forgot is not an error for disconnect. */
export async function revokeToken(token: string, fetchImpl: Fetch = fetch): Promise<void> {
  const response = await fetchImpl("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
  if (!response.ok) {
    const error = await readGoogleError(response);
    if (error.reason !== "invalid_token") throw error;
  }
}

/** The email claim of an id_token Google just handed us over TLS. Not a
 * signature check: we aren't trusting it for authentication, only for a label. */
export function emailFromIdToken(idToken: string | undefined): string | null {
  try {
    const payload = JSON.parse(Buffer.from(idToken?.split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: unknown };
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

export { GoogleApiError };
