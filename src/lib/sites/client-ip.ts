const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

/** Caller's IP from the proxy chain's `x-forwarded-for` (first hop), or null
 * if it's missing or doesn't look like an address, so a spoofed header can't
 * put arbitrary text into the database's inet column. */
export function clientIp(forwardedFor: string | null): string | null {
  const first = forwardedFor?.split(",")[0]?.trim();
  if (!first) return null;
  if (IPV4.test(first) && first.split(".").every((n) => Number(n) <= 255)) return first;
  if (first.includes(":") && IPV6.test(first)) return first;
  return null;
}
