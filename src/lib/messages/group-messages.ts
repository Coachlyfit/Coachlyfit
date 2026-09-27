import type { Database } from "@/lib/supabase/database.types";
import { getMessageStatus, type MessageStatus } from "./message-status";

type Message = Database["public"]["Tables"]["messages"]["Row"];

export type PendingMessage = {
  tempId: string;
  body: string;
  createdAt: string;
  status: "sending" | "failed";
};

export type RenderableMessage = {
  key: string;
  body: string;
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
    createdAt: message.created_at,
    senderRole: message.sender_role as "coach" | "client",
    isOwn: message.sender_role === viewerRole,
    status: getMessageStatus({ isOwn: message.sender_role === viewerRole, readAt: message.read_at }),
  }));

  const fromPending: RenderableMessage[] = pending.map((p) => ({
    key: p.tempId,
    body: p.body,
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
