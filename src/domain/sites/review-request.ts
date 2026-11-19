// What the review page learns about a link, from get_review_request().
// Parsed defensively: the RPC returns json, and the page must degrade to the
// generic "expired" screen on anything unexpected.

export type ReviewLinkState = "open" | "used" | "expired" | "invalid";

export type ReviewRequestView = {
  state: ReviewLinkState;
  expiresAt: string | null;
  /** Pre-filled first name from the client's record. */
  firstName: string;
  /** Signed thumbnails of the card the consent switch would share. */
  preview: { before: string | null; after: string | null } | null;
  coach: {
    name: string;
    slug: string;
    logoPath: string | null;
    primary: string | null;
    accent: string | null;
  } | null;
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : null);

export function parseReviewRequest(raw: unknown): ReviewRequestView {
  const invalid: ReviewRequestView = { state: "invalid", expiresAt: null, firstName: "", preview: null, coach: null };
  if (!isObj(raw)) return invalid;

  const state = raw.state;
  if (state !== "open" && state !== "used" && state !== "expired") return invalid;

  const coachRaw = isObj(raw.coach) ? raw.coach : null;
  const previewRaw = isObj(raw.preview) ? raw.preview : null;

  return {
    state,
    expiresAt: str(raw.expires_at),
    firstName: str(raw.first_name) ?? "",
    preview: previewRaw ? { before: str(previewRaw.before), after: str(previewRaw.after) } : null,
    coach: coachRaw
      ? {
          name: str(coachRaw.business_name) ?? "",
          slug: str(coachRaw.slug) ?? "",
          logoPath: str(coachRaw.logo_path),
          primary: str(coachRaw.brand_primary),
          accent: str(coachRaw.brand_accent),
        }
      : null,
  };
}

/** `ok` result of submit_review(), or the generic reason it failed. */
export type SubmitOutcome =
  | { ok: true; displayName: string; sharePhotos: boolean }
  | { ok: false; error: "invalid_input" | "invalid_link" | "rate_limited" | "failed" };

export function parseSubmitOutcome(raw: unknown): SubmitOutcome {
  if (isObj(raw) && raw.ok === true) {
    return { ok: true, displayName: str(raw.display_name) ?? "", sharePhotos: raw.share_photos === true };
  }
  const error = isObj(raw) ? raw.error : null;
  return { ok: false, error: error === "invalid_input" || error === "invalid_link" || error === "rate_limited" ? error : "failed" };
}
