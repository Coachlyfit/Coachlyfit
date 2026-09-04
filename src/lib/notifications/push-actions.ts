"use server";

import { createClient } from "@/lib/supabase/server";
import { PushSubscriptionsService, type SubscribePushInput } from "@/domain/notifications/push-subscriptions.service";

// Used from both (coach) and (client) topbars via PushSubscribeButton, so
// this lives outside any single route group's actions.ts — same reasoning
// as sign-out-action.ts.

export async function subscribePushAction(input: SubscribePushInput): Promise<{ error: string } | void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  await new PushSubscriptionsService(supabase).subscribe(user.id, input);
}

export async function unsubscribePushAction(endpoint: string): Promise<{ error: string } | void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  await new PushSubscriptionsService(supabase).unsubscribe(endpoint);
}
