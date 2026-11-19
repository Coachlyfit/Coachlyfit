import { createAnonClient } from "@/lib/supabase/anon";
import type { SiteStatus } from "./host";

// The proxy runs on every request, so lookups are memoized per instance. A
// minute is the longest a freshly published site (or a removed one) can take
// to start / stop being served on a warm instance.
const TTL_MS = 60_000;
const MAX_ENTRIES = 500;
const cache = new Map<string, { status: SiteStatus; expires: number }>();

/** 'none' | 'unpublished' | 'published' for a custom domain or coach slug.
 * A failed lookup answers 'none' (the platform keeps serving) and isn't cached. */
export async function getSiteStatus(key: string): Promise<SiteStatus> {
  const k = key.toLowerCase();
  const hit = cache.get(k);
  if (hit && hit.expires > Date.now()) return hit.status;

  let data: unknown;
  try {
    const res = await createAnonClient().rpc("site_status", { p_key: k });
    if (res.error) return "none";
    data = res.data;
  } catch {
    return "none"; // network hiccup: don't take the platform down with it
  }

  const status: SiteStatus = data === "published" || data === "unpublished" ? data : "none";
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(k, { status, expires: Date.now() + TTL_MS });
  return status;
}
