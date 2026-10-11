"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CoachSubscriptionService } from "@/domain/billing/coach-subscription.service";
import { subscriptionRequestSchema, type SubscriptionRequestInput } from "./schemas";

type ActionResult = { error: string } | void;

// Authorization is in the database: RLS only lets the tenant owner insert or
// withdraw a request, and set_my_subscription_cancel() acts on the caller's
// own subscription. Nothing here takes a coach id from the client.

export async function requestSubscriptionChangeAction(
  locale: string,
  input: SubscriptionRequestInput
): Promise<ActionResult> {
  const parsed = subscriptionRequestSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const code = await new CoachSubscriptionService(supabase).createRequest(user.id, parsed.data);
  if (code === "23505") return { error: "request_pending" };
  // 42501 = RLS refusal, 23503 = not a coach row: both mean "not the owner".
  if (code === "42501" || code === "23503") return { error: "forbidden" };
  if (code) return { error: "request_failed" };

  revalidatePath(`/${locale}/settings/subscription`);
}

export async function withdrawRequestAction(locale: string, requestId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  try {
    const ok = await new CoachSubscriptionService(supabase).withdrawRequest(requestId);
    if (!ok) return { error: "not_found_or_forbidden" };
  } catch {
    return { error: "request_failed" };
  }
  revalidatePath(`/${locale}/settings/subscription`);
}

export async function setCancelAtPeriodEndAction(locale: string, cancel: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const code = await new CoachSubscriptionService(supabase).setCancelAtPeriodEnd(cancel);
  if (code === "P0002") return { error: "forbidden" };
  if (code) return { error: "request_failed" };

  revalidatePath(`/${locale}/settings/subscription`);
}
