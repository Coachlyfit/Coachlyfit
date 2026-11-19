import "server-only";
import { headers } from "next/headers";
import { parseReviewRequest, type ReviewRequestView } from "@/domain/sites/review-request";
import { publicStorageUrl } from "@/domain/sites/public-site";
import { parseDraft } from "@/domain/sites/site-content";
import { guardColors, type SiteColors } from "@/domain/sites/theme";
import { createAnonClient } from "@/lib/supabase/anon";
import { waLink } from "@/lib/whatsapp";
import { clientIp } from "./client-ip";
import { getPublicSite } from "./public-site";

const TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

export type ReviewPageData = {
  request: ReviewRequestView;
  coachName: string;
  logoUrl: string | null;
  colors: SiteColors;
  /** The coach's WhatsApp number from their published site, if any. */
  whatsapp: string | null;
};

/** Everything the review pages need, or null when there's no coach to brand
 * the page with (then the caller 404s). Never cached: the link is personal and
 * single-use. Branding comes from the link when it exists, else from the site
 * on this domain, so an unknown or expired link still looks like the coach's. */
export async function loadReviewPage(domain: string, token: string): Promise<ReviewPageData | null> {
  const [request, site] = await Promise.all([fetchRequest(token), getPublicSite(decodeURIComponent(domain))]);

  const coach = request.coach ?? (site ? { name: site.coach.business_name, slug: site.coach.slug, logoPath: site.coach.logo_path, primary: site.coach.brand_primary, accent: site.coach.brand_accent } : null);
  if (!coach) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const whatsapp = site?.is_published ? parseDraft(site.content).hero.whatsapp || null : null;

  return {
    request,
    coachName: coach.name,
    logoUrl: coach.logoPath ? publicStorageUrl(supabaseUrl, "coach-logos", coach.logoPath) : null,
    colors: guardColors(coach.primary, coach.accent),
    whatsapp,
  };
}

async function fetchRequest(token: string): Promise<ReviewRequestView> {
  if (!TOKEN.test(token)) return parseReviewRequest(null);
  const h = await headers();
  const { data, error } = await createAnonClient().rpc("get_review_request", {
    p_token: token,
    p_ip: clientIp(h.get("x-forwarded-for")) ?? undefined,
  });
  return parseReviewRequest(error ? null : data);
}

/** "Ask for a new link" on WhatsApp, prefilled. */
export function newLinkHref(whatsapp: string | null, text: string): string | null {
  return whatsapp ? waLink(whatsapp, text) : null;
}
