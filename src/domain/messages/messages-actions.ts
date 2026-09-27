"use server";

import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
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
    const coachId = await resolveCoachId(supabase);
    if (!coachId) return null;
    return { coachId, clientId, role: "coach" as const };
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

  try {
    await new MessagesService(supabase).send(ctx.coachId, ctx.clientId, { sender_role: ctx.role, body: trimmed });
  } catch {
    return { error: "send_failed" };
  }
}

export async function listInboxAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "coach") return [];

  return new MessagesService(supabase).listInbox();
}

export async function markThreadReadAction(clientId: string) {
  const supabase = await createClient();
  const ctx = await callerContext(supabase, clientId);
  if (!ctx) return;
  await new MessagesService(supabase).markThreadRead(clientId, ctx.role);
}

// Coach-only — not clientId-scoped like callerContext, so resolved separately.
export async function sendBroadcastAction(body: string): Promise<{ error: string } | void> {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 2000) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "coach") return { error: "not_authenticated" };
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" };

  const { data: clients } = await supabase.from("clients").select("id").eq("coach_id", coachId).eq("status", "active");
  if (!clients || clients.length === 0) return { error: "no_recipients" };

  await new MessagesService(supabase).broadcast(
    coachId,
    clients.map((c) => c.id),
    trimmed,
  );
}
