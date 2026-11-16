/** A failed Google call, reduced to what the sync logic decides on. The message
 * is Google's error code/reason only: never a token, the client secret, or a
 * request body. */
export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    /** Google's machine reason: "invalid_grant", "rateLimitExceeded", "notFound", ... */
    readonly reason: string,
    /** From a Retry-After header, when Google sent one. */
    readonly retryAfterMs: number | null = null
  ) {
    super(`Google API error ${status} ${reason}`);
    this.name = "GoogleApiError";
  }

  /** The refresh token is dead (revoked, expired, password change...). */
  get isAuthRevoked(): boolean {
    return this.reason === "invalid_grant" || this.reason === "unauthorized_client";
  }

  /** Slow down and retry: quota/rate limit (403/429). */
  get isRateLimit(): boolean {
    return (
      this.status === 429 ||
      (this.status === 403 &&
        ["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded", "dailyLimitExceeded"].includes(this.reason))
    );
  }
}

/** Reads an error response. Handles both shapes Google uses: OAuth
 * (`{ "error": "invalid_grant" }`) and the Calendar API
 * (`{ "error": { "errors": [{ "reason": "..." }] } }`). */
export async function readGoogleError(response: Response): Promise<GoogleApiError> {
  let reason = "unknown";
  try {
    const body = (await response.json()) as {
      error?: string | { errors?: { reason?: string }[]; status?: string };
    };
    if (typeof body.error === "string") reason = body.error;
    else reason = body.error?.errors?.[0]?.reason ?? body.error?.status ?? "unknown";
  } catch {
    // Non-JSON body (an HTML 502): the status says enough.
  }
  const retryAfter = Number(response.headers.get("retry-after"));
  return new GoogleApiError(response.status, reason, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null);
}
