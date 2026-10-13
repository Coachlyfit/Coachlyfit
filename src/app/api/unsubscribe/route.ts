import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { leadUnsubscribe } from "@/domain/leads/unsubscribe";

// The URL in the List-Unsubscribe header of outreach emails. Mail providers
// POST to it for one-click unsubscribe (RFC 8058), which a page can't answer,
// so it lives here and not at /[locale]/unsubscribe. Public: the token is the
// only credential, and lead_unsubscribe() is all an anonymous caller can reach.

/** One-click unsubscribe. Always 200, whatever the token: the sender learns
 * nothing about which tokens exist. */
export async function POST(request: NextRequest) {
  await leadUnsubscribe(await createClient(), request.nextUrl.searchParams.get("token"), true);
  return NextResponse.json({ ok: true });
}

/** A person (or a scanner) opening the header URL: send them to the page,
 * where unsubscribing takes a button press. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const requested = params.get("locale");
  const locale = routing.locales.find((candidate) => candidate === requested) ?? routing.defaultLocale;

  const target = new URL(`/${locale}/unsubscribe`, request.nextUrl.origin);
  const token = params.get("token");
  if (token) target.searchParams.set("token", token);
  return NextResponse.redirect(target);
}
