"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { PresenceService } from "@/domain/presence/presence.service";
import { MessagesService, type ThreadPage } from "./messages.service";
import {
  VOICE_NOTE_MAX_BYTES,
  VOICE_NOTE_MAX_SECONDS,
  VOICE_NOTE_MIN_SECONDS,
  normalizeVoiceMime,
  sniffVoiceMime,
} from "./voice-notes";

const sendSchema = z.object({
  clientId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
  id: z.string().uuid().optional(),
});

const sendVoiceSchema = z.object({
  clientId: z.string().uuid(),
  id: z.string().uuid(),
  durationSec: z.coerce.number().int().min(VOICE_NOTE_MIN_SECONDS).max(VOICE_NOTE_MAX_SECONDS),
});

const broadcastSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  audience: z.enum(["all", "subscribed"]),
});

// Presence is one coach's own roster, never paginated in the UI -- ask for
// more rows than any tier's seat cap rather than paging the RPC.
const PRESENCE_LIMIT = 1000;

export type ClientPresence = { online: boolean; lastSeenAt: string | null };

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

// Coach-only actions aren't clientId-scoped like callerContext, so the
// coach's own tenant id is resolved separately.
async function coachContext(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "coach") return null;
  const coachId = await resolveCoachId(supabase);
  return coachId ? { coachId } : null;
}

export async function listThreadPageAction(clientId: string, before: string | null): Promise<ThreadPage> {
  const supabase = await createClient();
  const ctx = await callerContext(supabase, clientId);
  if (!ctx) return { messages: [], hasMore: false };
  return new MessagesService(supabase).listThreadPage(clientId, { before });
}

export async function sendMessageAction(
  clientId: string,
  body: string,
  id?: string,
): Promise<{ error: string } | void> {
  const parsed = sendSchema.safeParse({ clientId, body, id });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const ctx = await callerContext(supabase, parsed.data.clientId);
  if (!ctx) return { error: "not_authenticated" };

  try {
    await new MessagesService(supabase).send(ctx.coachId, ctx.clientId, {
      ...(parsed.data.id ? { id: parsed.data.id } : {}),
      sender_role: ctx.role,
      body: parsed.data.body,
    });
  } catch {
    return { error: "send_failed" };
  }
}

/** FormData rather than plain arguments because it carries the recording.
 * Everything about the file is checked here again: the recorder's own limits
 * are a convenience, not a guarantee. */
export async function sendVoiceMessageAction(formData: FormData): Promise<{ error: string } | void> {
  const file = formData.get("file");
  const parsed = sendVoiceSchema.safeParse({
    clientId: formData.get("clientId"),
    id: formData.get("id"),
    durationSec: formData.get("durationSec"),
  });
  if (!parsed.success || !(file instanceof Blob)) return { error: "invalid_input" };
  if (file.size < 1 || file.size > VOICE_NOTE_MAX_BYTES) return { error: "too_large" };

  // The declared type has to be one we accept, and the bytes have to be it.
  const mime = normalizeVoiceMime(file.type);
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!mime || sniffVoiceMime(head) !== mime) return { error: "unsupported_format" };

  const supabase = await createClient();
  const ctx = await callerContext(supabase, parsed.data.clientId);
  if (!ctx) return { error: "not_authenticated" };

  const { data: relationship } = await supabase
    .from("coaching_relationships")
    .select("id")
    .eq("client_id", ctx.clientId)
    .eq("coach_id", ctx.coachId)
    .eq("status", "active")
    .maybeSingle();
  if (!relationship) return { error: "send_failed" };

  try {
    await new MessagesService(supabase).sendVoice(ctx.coachId, ctx.clientId, relationship.id, {
      id: parsed.data.id,
      sender_role: ctx.role,
      file,
      mime,
      durationSec: parsed.data.durationSec,
    });
  } catch {
    return { error: "send_failed" };
  }
}

/** Signed on demand (when the listener presses play), never embedded in the
 * thread: the URL is short-lived and only for someone RLS lets read the note. */
export async function getVoiceNoteUrlAction(messageId: string): Promise<{ url: string } | { error: "unavailable" }> {
  if (!z.string().uuid().safeParse(messageId).success) return { error: "unavailable" };
  const supabase = await createClient();
  try {
    const url = await new MessagesService(supabase).signVoiceUrl(messageId);
    return url ? { url } : { error: "unavailable" };
  } catch {
    return { error: "unavailable" };
  }
}

export async function listInboxAction() {
  const supabase = await createClient();
  if (!(await coachContext(supabase))) return [];
  return new MessagesService(supabase).listInbox();
}

/** Online / last-seen for the coach's own clients, keyed by client id. The
 * RPC scopes to the caller's roster itself and reports profile ids, so the
 * clients read here (RLS-scoped the same way) only translates the key. */
export async function listPresenceAction(): Promise<Record<string, ClientPresence>> {
  const supabase = await createClient();
  if (!(await coachContext(supabase))) return {};

  const [{ data: clients }, presence] = await Promise.all([
    supabase.from("clients").select("id, profile_id").not("profile_id", "is", null),
    new PresenceService(supabase).list({ pageSize: PRESENCE_LIMIT }),
  ]);

  const clientIdByProfile = new Map((clients ?? []).map((c) => [c.profile_id, c.id]));
  const result: Record<string, ClientPresence> = {};
  for (const row of presence.rows) {
    const clientId = clientIdByProfile.get(row.userId);
    if (clientId) result[clientId] = { online: row.online, lastSeenAt: row.lastSeenAt };
  }
  return result;
}

export async function markThreadReadAction(clientId: string) {
  const supabase = await createClient();
  const ctx = await callerContext(supabase, clientId);
  if (!ctx) return;
  await new MessagesService(supabase).markThreadRead(clientId, ctx.role);
}

export async function sendBroadcastAction(
  body: string,
  audience: "all" | "subscribed",
): Promise<{ error: string } | void> {
  const parsed = broadcastSchema.safeParse({ body, audience });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const ctx = await coachContext(supabase);
  if (!ctx) return { error: "not_authenticated" };

  const service = new MessagesService(supabase);
  try {
    // Recipients are re-resolved here, never taken from the dialog: the
    // counts it showed are only a preview.
    const recipients = (await service.listBroadcastRecipients(new Date()))[parsed.data.audience];
    if (recipients.length === 0) return { error: "no_recipients" };
    await service.broadcast(ctx.coachId, recipients, parsed.data.body);
  } catch {
    return { error: "send_failed" };
  }
}
