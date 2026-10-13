import type { Database } from "@/lib/supabase/database.types";
import type { VoiceMime } from "@/domain/messages/voice-notes";
import { getMessageStatus, type MessageStatus } from "./message-status";

type Message = Database["public"]["Tables"]["messages"]["Row"];

export type VoiceRecording = { blob: Blob; mime: VoiceMime; durationSec: number };

export type PendingMessage = {
  tempId: string;
  body: string;
  createdAt: string;
  status: "sending" | "failed";
  /** Set for a voice note; body is then empty. */
  voice?: VoiceRecording;
};

export type RenderableVoice = {
  /** Null while the note is still only on this device. */
  messageId: string | null;
  durationSec: number;
  /** The file is past retention and gone; only the row is left. */
  expired: boolean;
  /** The sender's own recording, playable before (and without) a download. */
  localBlob?: Blob;
};

export type RenderableMessage = {
  key: string;
  body: string;
  voice?: RenderableVoice;
  createdAt: string;
  senderRole: "coach" | "client";
  isOwn: boolean;
  status: MessageStatus | null;
  pendingRef?: PendingMessage;
};

export type ThreadItem =
  | { kind: "date-separator"; key: string; date: string }
  | { kind: "message-group"; key: string; senderRole: "coach" | "client"; isOwn: boolean; messages: RenderableMessage[] };

const DEFAULT_GROUP_GAP_MS = 5 * 60 * 1000;

/** Merges confirmed server rows with still-in-flight optimistic messages into
 * one chronological render list. */
export function toRenderableMessages(
  messages: Message[],
  pending: PendingMessage[],
  viewerRole: "coach" | "client",
): RenderableMessage[] {
  const fromServer: RenderableMessage[] = messages.map((message) => ({
    key: message.id,
    body: message.body,
    ...(message.kind === "voice" && {
      voice: {
        messageId: message.id,
        durationSec: message.audio_duration_sec ?? 0,
        expired: message.audio_deleted_at != null,
      },
    }),
    createdAt: message.created_at,
    senderRole: message.sender_role as "coach" | "client",
    isOwn: message.sender_role === viewerRole,
    status: getMessageStatus({ isOwn: message.sender_role === viewerRole, readAt: message.read_at }),
  }));

  const fromPending: RenderableMessage[] = pending.map((p) => ({
    key: p.tempId,
    body: p.body,
    ...(p.voice && {
      voice: { messageId: null, durationSec: p.voice.durationSec, expired: false, localBlob: p.voice.blob },
    }),
    createdAt: p.createdAt,
    senderRole: viewerRole,
    isOwn: true,
    status: getMessageStatus({ isOwn: true, readAt: null, pendingStatus: p.status }),
    pendingRef: p,
  }));

  return [...fromServer, ...fromPending].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

/** Groups a chronological message list into date separators + consecutive-
 * sender runs (WhatsApp/Telegram convention: same sender, gap under
 * groupGapMs, no date boundary crossed). Pure function — no React. */
export function groupMessages(items: RenderableMessage[], groupGapMs = DEFAULT_GROUP_GAP_MS): ThreadItem[] {
  const result: ThreadItem[] = [];
  let currentGroup: Extract<ThreadItem, { kind: "message-group" }> | null = null;
  let lastDate: string | null = null;
  let lastCreatedAt: number | null = null;

  for (const item of items) {
    const itemDate = new Date(item.createdAt);
    const dayKey = itemDate.toDateString();

    if (dayKey !== lastDate) {
      result.push({ kind: "date-separator", key: `sep-${dayKey}`, date: item.createdAt });
      currentGroup = null;
      lastDate = dayKey;
    }

    const gapExceeded = lastCreatedAt != null && itemDate.getTime() - lastCreatedAt > groupGapMs;
    const sameSenderGroup = currentGroup && currentGroup.senderRole === item.senderRole && !gapExceeded;

    if (sameSenderGroup && currentGroup) {
      currentGroup.messages.push(item);
    } else {
      currentGroup = {
        kind: "message-group",
        key: `group-${item.key}`,
        senderRole: item.senderRole,
        isOwn: item.isOwn,
        messages: [item],
      };
      result.push(currentGroup);
    }

    lastCreatedAt = itemDate.getTime();
  }

  return result;
}
