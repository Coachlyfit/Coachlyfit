import { headers } from "next/headers";

/** Server Component/Action-side read of the coach slug the proxy forwarded
 * (see src/proxy.ts) — from the subdomain, or from a `?coach=` query param
 * fallback when there's no wildcard domain configured yet. Null on the
 * app's own root domain with no query param. Split out from portal-slug.ts
 * because next/headers can't be imported into a client bundle, and
 * getRootDomain() there needs to be callable from one. */
export async function resolvePortalSlug(): Promise<string | null> {
  const h = await headers();
  return h.get("x-coach-slug");
}
