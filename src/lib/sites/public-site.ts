import "server-only";
import { unstable_cache } from "next/cache";
import type { PublicSiteRow } from "@/domain/sites/public-site";
import { createAnonClient } from "@/lib/supabase/anon";

/** Cache tags for a coach's public site. Publishing / moderating revalidates
 * `site:<key>` for the coach's domain and slug; a client withdrawing consent
 * can't know the coach, so it revalidates the shared `sites` tag. */
export const SITES_TAG = "sites";
export const siteTag = (key: string) => `site:${key.toLowerCase()}`;

// A safety net for changes nothing revalidates (e.g. a branding edit).
// Content changes and consent withdrawal revalidate on demand.
const REVALIDATE_SECONDS = 300;

/** The public site for a custom domain or coach slug, or null if there is
 * none. Reads through get_public_site(), which only ever returns published,
 * consented and approved content. */
export function getPublicSite(key: string): Promise<PublicSiteRow | null> {
  const k = key.toLowerCase();
  return unstable_cache(
    async () => {
      const { data, error } = await createAnonClient().rpc("get_public_site", { p_key: k });
      if (error) throw error;
      return (data as PublicSiteRow | null) ?? null;
    },
    ["public-site", k],
    { tags: [siteTag(k), SITES_TAG], revalidate: REVALIDATE_SECONDS }
  )();
}
