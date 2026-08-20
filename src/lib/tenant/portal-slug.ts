/** Root domain the app is served from — a coach's white-label subdomain is
 * `<slug>.<root domain>`. Defaults to "localhost" so `<slug>.localhost:3000`
 * works in local dev without any env setup (Chrome resolves *.localhost to
 * loopback automatically); set NEXT_PUBLIC_ROOT_DOMAIN once a real domain is
 * configured in production. Framework-free (no next/headers import) so both
 * the proxy/Server Components AND client components (building a shareable
 * portal URL) can call it. */
export function getRootDomain(): string {
  const configured = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  return (configured || "localhost").split(":")[0].toLowerCase();
}

/** Pulls the coach slug out of a request's Host header, or null if this
 * request is hitting the app's own root domain (or anything that isn't a
 * direct one-level subdomain of it — a Vercel preview URL, an IP, etc). */
export function extractPortalSlug(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0].toLowerCase();
  const root = getRootDomain();

  if (hostname === root || hostname === `www.${root}`) return null;
  if (!hostname.endsWith(`.${root}`)) return null;

  const slug = hostname.slice(0, -(root.length + 1));
  if (!slug || slug.includes(".")) return null;
  return slug;
}
