import { headers } from "next/headers";

/** Server Component/Action-side read of the slug the proxy forwarded (see
 * src/proxy.ts) — null on the app's own root domain. Split out from
 * portal-slug.ts because next/headers can't be imported into a client
 * bundle, and getRootDomain() there needs to be callable from one. */
export async function resolvePortalSlug(): Promise<string | null> {
  const h = await headers();
  return h.get("x-coach-slug");
}
