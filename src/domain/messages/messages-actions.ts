"use server";

import { createClient } from "@/lib/supabase/server";
import { MessagesService } from "./messages.service";

// Resolves which side of the conversation the caller is, and their own
// coach_id/client_id — never trusts a caller-supplied role or id, same rule
// as progress/actions.ts's currentClientRow.
async function callerContext(supabase: Awaited<ReturnType<typeof createClient>>, clientId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role === "coach") {
    return { coachId: user.id, clientId, role: "coach" as const };
  }
  if (profile?.role === "client") {
    const { data: client } = await supabase
      .from("clients")
      .select("id, coach_id")
      .eq("profile_id", user.id)
      .single();
    if (!client || client.id !== clientId) return null;
    return { coachId: client.coach_id, clientId: client.id, role: "client" as const };
  }
  return null;
}

export async function listThreadAction(clientId: string) {
  const supabase = await createClient();
  const ctx = await callerContext(supabase, clientId);
  if (!ctx) return [];
  return new MessagesService(supabase).listThread(clientId);
}

export async function sendMessageAction(clientId: string, body: string): Promise<{ error: string } | void> {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 2000) return { error: "invalid_input" };

  const supabase = await createClient();
  const ctx = await callerContext(supabase, clientId);
  if (!ctx) return { error: "not_authenticated" };

  await new MessagesService(supabase).send(ctx.coachId, ctx.clientId, { sender_role: ctx.role, body: trimmed });
}

export async function markThreadReadAction(clientId: string) {
  const supabase = await createClient();
  const ctx = await callerContext(supabase, clientId);
  if (!ctx) return;
  await new MessagesService(supabase).markThreadRead(clientId, ctx.role);
}
