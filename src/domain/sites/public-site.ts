// What the public site renders from: the get_public_site() RPC result,
// reshaped into a view model with resolved image URLs and guarded colors.
// Pure (no Next / React), so the editor preview and the real site share it.
import { portalLoginUrl } from "@/lib/sites/origin";
import { flatten, parseDraft, type Lang, type SiteContent } from "./site-content";
import type { SiteTheme } from "./palette";
import { guardColors, type SiteColors } from "./theme";

/** Shape of get_public_site()'s json. Never contains client ids. */
export type PublicSiteRow = {
  is_published: boolean;
  domain: string | null;
  published_at?: string;
  content?: unknown;
  /** Only on an unpublished site (no content): the coach's color theme, for the coming-soon page. */
  theme?: unknown;
  coach: {
    business_name: string;
    slug: string;
    logo_path: string | null;
    brand_primary: string | null;
    brand_accent: string | null;
  };
  results?: { id: string; before_path: string; after_path: string; duration_days: number; weight_delta: number | null }[];
  reviews?: { id: string; rating: number; body: string; display_name: string; created_at: string }[];
};

export type ResultView = {
  id: string;
  /** null = show the silhouette placeholder (sample / preview data). */
  beforeUrl: string | null;
  afterUrl: string | null;
  durationDays: number;
  weightDelta: number | null;
};

export type ReviewView = { id: string; name: string; rating: number; text: string };

export type SiteView = {
  coachName: string;
  logoUrl: string | null;
  colors: SiteColors;
  /** Shown in the footer, e.g. coachahmed.fit. */
  domain: string | null;
  content: SiteContent;
  /** The coach's own colors (light/dark palettes and mode). */
  theme: SiteTheme;
  photoUrl: string | null;
  /** Sample / preview data only: draw the silhouette where a photo would be
   * instead of the monogram tile. Real sites never set this. */
  usePlaceholderPhoto?: boolean;
  /** Client sign-in link (the coach's portal); absent on sample pages. */
  loginUrl?: string;
  results: ResultView[];
  reviews: ReviewView[];
};

export type Bucket = "coach-logos" | "coach-site" | "site-results";

export function publicStorageUrl(supabaseUrl: string, bucket: Bucket, path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${encoded}`;
}

/** The published site as one language's plain content, ready to render. */
export function toSiteView(row: PublicSiteRow, supabaseUrl: string, lang: Lang): SiteView {
  const draft = parseDraft(row.content);
  const content = flatten(draft, lang);
  return {
    coachName: row.coach.business_name,
    logoUrl: row.coach.logo_path ? publicStorageUrl(supabaseUrl, "coach-logos", row.coach.logo_path) : null,
    colors: guardColors(row.coach.brand_primary, row.coach.brand_accent),
    domain: row.domain,
    loginUrl: portalLoginUrl(row.coach, lang),
    content,
    theme: draft.theme,
    photoUrl: content.about.photoPath ? publicStorageUrl(supabaseUrl, "coach-site", content.about.photoPath) : null,
    results: (row.results ?? []).map((r) => ({
      id: r.id,
      beforeUrl: publicStorageUrl(supabaseUrl, "site-results", r.before_path),
      afterUrl: publicStorageUrl(supabaseUrl, "site-results", r.after_path),
      durationDays: r.duration_days,
      weightDelta: r.weight_delta,
    })),
    reviews: (row.reviews ?? []).map((r) => ({ id: r.id, name: r.display_name, rating: r.rating, text: r.body })),
  };
}

/** "12 weeks" for ≥ 2 weeks, otherwise days. */
export function durationParts(days: number): { unit: "weeks" | "days"; n: number } {
  return days >= 14 ? { unit: "weeks", n: Math.round(days / 7) } : { unit: "days", n: days };
}

/** "−6" / "+3" with a real minus sign; null for no change recorded. The
 * caller wraps it in <bdi> so the sign stays put in RTL. */
export function signedKg(delta: number | null): string | null {
  if (delta === null || delta === 0) return null;
  const abs = Math.abs(delta);
  const n = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return `${delta < 0 ? "−" : "+"}${n}`;
}
