import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type { ThreadPage } from "@/domain/messages/messages.service";
import {
  listThreadPageAction,
  markThreadReadAction,
  sendMessageAction,
  sendVoiceMessageAction,
} from "@/domain/messages/messages-actions";
import { toRenderableMessages, type PendingMessage, type VoiceRecording } from "@/lib/messages/group-messages";
import { CLIENT_UNREAD_QUERY_KEY } from "./use-client-unread";
import { INBOX_QUERY_KEY } from "./use-inbox-threads";

type Message = Database["public"]["Tables"]["messages"]["Row"];
type ViewerRole = "coach" | "client";
type ThreadData = InfiniteData<ThreadPage, string | null>;

// Realtime delivers new messages/read-receipts near-instantly; polling stays
// as a fallback for missed events (reconnects, dropped sockets). A refetch
// re-reads every loaded page, so it's slower than NotificationBell's poll.
const POLL_INTERVAL_MS = 30_000;
const MARK_READ_DEBOUNCE_MS = 1500;

export function useMessageThread(
  clientId: string,
  viewerRole: ViewerRole,
  viewerAvatarUrl: string | null,
  otherAvatarUrl: string | null,
) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["messages", clientId], [clientId]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const lastMarkReadAtRef = useRef(0);

  // pages[0] is the newest page; each further page is the one before it.
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => listThreadPageAction(clientId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? (lastPage.messages[0]?.created_at ?? undefined) : undefined),
    refetchInterval: POLL_INTERVAL_MS,
  });

  const messages = useMemo(() => {
    // A message arriving between two page fetches shifts the cursor window,
    // so the same row can land in two pages.
    const seen = new Set<string>();
    const merged: Message[] = [];
    for (const page of [...(data?.pages ?? [])].reverse()) {
      for (const message of page.messages) {
        if (seen.has(message.id)) continue;
        seen.add(message.id);
        merged.push(message);
      }
    }
    return merged;
  }, [data]);

  // An optimistic entry carries the id its row is inserted with, so it is
  // hidden exactly when that row lands (realtime merge or refetch). Derived
  // on every render rather than pruned in an effect, so there's no extra
  // render pass just to reconcile state.
  const visiblePending = useMemo(() => {
    const ids = new Set(messages.map((m) => m.id));
    return pending.filter((p) => !ids.has(p.tempId));
  }, [pending, messages]);

  const markRead = useCallback(() => {
    // Only what the reader has actually had on screen counts as read.
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - lastMarkReadAtRef.current < MARK_READ_DEBOUNCE_MS) return;
    const hasUnreadFromOther = messages.some((m) => m.sender_role !== viewerRole && !m.read_at);
    if (!hasUnreadFromOther) return;
    lastMarkReadAtRef.current = now;
    markThreadReadAction(clientId).then(() => {
      queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: CLIENT_UNREAD_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    });
  }, [clientId, messages, viewerRole, queryClient]);

  useEffect(() => {
    markRead();
  }, [markRead]);

  useEffect(() => {
    function onVisibilityOrFocus() {
      if (document.visibilityState === "visible") markRead();
    }
    document.addEventListener("visibilitychange", onVisibilityOrFocus);
    window.addEventListener("focus", onVisibilityOrFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
      window.removeEventListener("focus", onVisibilityOrFocus);
    };
  }, [markRead]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`messages-db:${clientId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `client_id=eq.${clientId}` },
        (payload) => {
          const row = payload.new as Message;
          queryClient.setQueryData<ThreadData>(queryKey, (old) => {
            // Nothing loaded yet: the first page fetch will include this row.
            if (!old || old.pages.some((page) => page.messages.some((m) => m.id === row.id))) return old;
            const [newest, ...older] = old.pages;
            return { ...old, pages: [{ ...newest, messages: [...newest.messages, row] }, ...older] };
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `client_id=eq.${clientId}` },
        (payload) => {
          const row = payload.new as Message;
          queryClient.setQueryData<ThreadData>(queryKey, (old) =>
            old && {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                messages: page.messages.map((m) => (m.id === row.id ? row : m)),
              })),
            },
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, queryClient, queryKey]);

  const deliver = useCallback(
    async (id: string, body: string, voice?: VoiceRecording) => {
      let failed = false;
      try {
        if (voice) {
          const form = new FormData();
          form.set("clientId", clientId);
          form.set("id", id);
          form.set("durationSec", String(voice.durationSec));
          form.set("file", voice.blob);
          failed = !!(await sendVoiceMessageAction(form))?.error;
        } else {
          failed = !!(await sendMessageAction(clientId, body, id))?.error;
        }
      } catch {
        // Offline / dropped request: the action never reached the server.
        failed = true;
      }
      if (failed) setPending((p) => p.map((m) => (m.tempId === id ? { ...m, status: "failed" } : m)));
    },
    [clientId],
  );

  const send = useCallback(
    (body: string) => {
      const id = crypto.randomUUID();
      setPending((p) => [...p, { tempId: id, body, createdAt: new Date().toISOString(), status: "sending" }]);
      void deliver(id, body);
    },
    [deliver],
  );

  // The recording stays in memory with its pending entry, so a failed send
  // can be retried without recording again.
  const sendVoice = useCallback(
    (voice: VoiceRecording) => {
      const id = crypto.randomUUID();
      setPending((p) => [...p, { tempId: id, body: "", createdAt: new Date().toISOString(), status: "sending", voice }]);
      void deliver(id, "", voice);
    },
    [deliver],
  );

  // Re-sends under the same id, so a first attempt that did reach the
  // database (only its response was lost) can't produce a second message.
  const retry = useCallback(
    (tempId: string) => {
      const target = visiblePending.find((p) => p.tempId === tempId);
      if (!target) return;
      setPending((p) => p.map((m) => (m.tempId === tempId ? { ...m, status: "sending" } : m)));
      void deliver(tempId, target.body, target.voice);
    },
    [deliver, visiblePending],
  );

  const renderable = toRenderableMessages(
    messages,
    visiblePending,
    viewerRole,
    viewerAvatarUrl,
    otherAvatarUrl,
  );

  return {
    renderable,
    isLoading,
    send,
    sendVoice,
    retry,
    hasOlder: hasNextPage,
    isLoadingOlder: isFetchingNextPage,
    loadOlder: fetchNextPage,
  };
}
