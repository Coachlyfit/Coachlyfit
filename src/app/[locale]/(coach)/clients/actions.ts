"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { InvitesService } from "@/domain/clients/invites.service";
import { createInviteSchema } from "./schemas";

type ActionResult = { error: string } | { joinUrl: string };

function joinUrl(locale: string, token: string) {
  return `${process.env.NEXT_PUBLIC_APP_URL}/${locale}/join/${token}`;
}

export async function createClientInviteAction(
  locale: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = createInviteSchema.safeParse({
    displayName: formData.get("displayName") || undefined,
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  try {
    const { token } = await new InvitesService(supabase).createInvite(user.id, parsed.data);
    revalidatePath(`/${locale}/clients`);
    return { joinUrl: joinUrl(locale, token) };
  } catch {
    // Most likely the client-cap trigger (private.enforce_client_cap) —
    // the tier limit is enforced in the DB, not just the UI.
    return { error: "client_limit_reached" };
  }
}

export async function regenerateInviteAction(
  locale: string,
  clientId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  try {
    const { token } = await new InvitesService(supabase).regenerateInvite(user.id, clientId);
    return { joinUrl: joinUrl(locale, token) };
  } catch {
    return { error: "signup_failed" };
  }
}
