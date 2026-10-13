"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { leadUnsubscribe } from "@/domain/leads/unsubscribe";

const localeSchema = z.enum(routing.locales);

/** The confirm button on the unsubscribe page. Public: the token is the only
 * credential. The page reads the state again after the redirect, so an
 * unknown token lands on the same generic message as before. */
export async function confirmUnsubscribeAction(locale: string, token: string): Promise<void> {
  const parsedLocale = localeSchema.safeParse(locale);
  const safeLocale = parsedLocale.success ? parsedLocale.data : routing.defaultLocale;

  await leadUnsubscribe(await createClient(), token, true);
  redirect(`/${safeLocale}/unsubscribe?token=${encodeURIComponent(token)}`);
}
