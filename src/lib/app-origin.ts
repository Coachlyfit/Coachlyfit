import { headers } from "next/headers";

/** The public origin of this app, e.g. https://app.example.com. Prefers
 * NEXT_PUBLIC_APP_URL (an empty value counts as unset); otherwise rebuilds it
 * from the request, so links shown to users are always absolute (a calendar
 * app can't subscribe to a bare "/api/..." path). */
export async function appOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
