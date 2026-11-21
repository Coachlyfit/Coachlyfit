"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { SITES_TAG } from "@/lib/sites/public-site";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error: string } | void;

const cardId = z.string().uuid();

/** Client answers a pending "share my before/after card" request. */
export async function respondToCardConsentAction(locale: string, input: { cardId: string; agree: boolean }): Promise<ActionResult> {
  if (!cardId.safeParse(input.cardId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_card_consent", { p_card_id: input.cardId, p_agree: input.agree });
  if (error) return { error: "failed" };
  revalidatePath(`/${locale}/c`);
  revalidatePath(`/${locale}/c/progress`);
}

/** Client withdraws consent, any time. The database unpublishes the card
 * right away; revalidating the sites tag makes cached pages drop it now
 * instead of at the next refresh (the client doesn't know which coach site
 * it was on, so every cached site is refreshed). */
export async function withdrawCardConsentAction(locale: string, input: { cardId: string }): Promise<ActionResult> {
  if (!cardId.safeParse(input.cardId).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_consent_client", { p_card_id: input.cardId });
  if (error) return { error: "failed" };
  revalidateTag(SITES_TAG, "max");
  revalidatePath(`/${locale}/c`);
  revalidatePath(`/${locale}/c/progress`);
}
