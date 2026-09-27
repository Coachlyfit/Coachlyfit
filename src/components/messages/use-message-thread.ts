import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { listThreadAction, markThreadReadAction, sendMessageAction } from "@/domain/messages/messages-actions";
import { toRenderableMessages, type PendingMessage } from "@/lib/messages/group-messages";

type Message = Database["public"]["Tables"]["messages"]["Row"];
type ViewerRole = "coach" | "client";

// Realtime delivers new messages/read-receipts near-instantly; polling stays
// as a fallback for missed events (reconnects, dropped sockets), same
// interval NotificationBell uses.
const POLL_INTERVAL_MS = 10_000;
const PENDING_MATCH_WINDOW_MS = 10_000;
const MARK_READ_DEBOUNCE_MS = 1500;

function sortByCreatedAt(a: Message, b: Message) {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

export function useMessageThread(clientId: string, viewerRole: ViewerRole) {
  const queryClient = useQueryClient();
  const queryKey = ["messages", clientId];
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const lastMarkReadAtRef = useRef(0);

  const { data: messages = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => listThreadAction(clientId),
    refetchInterval: POLL_INTERVAL_MS,
  });

  // A pending entry is hidden once a matching server row has landed (via the
  // realtime merge below or the poll refetch) — heuristic match since there's
  // no client-generated id column: same sender, same body, close in time.
  // Derived on every render rather than pruned in an effect, so there's no
  // extra render pass just to reconcile state.
  const visiblePending = useMemo(
    () =>
      pending.filter((p) => {
        const matched = messages.some(
          (m) =>
            m.sender_role === viewerRole &&
            m.body === p.body &&
            Math.abs(new Date(m.created_at).getTime() - new Date(p.createdAt).getTime()) <= PENDING_MATCH_WINDOW_MS,
        );
        return !matched;
      }),
    [pending, messages, viewerRole],
  );

  const markRead = useCallback(() => {
    const now = Date.now();
    if (now - lastMarkReadAtRef.current < MARK_READ_DEBOUNCE_MS) return;
    const hasUnreadFromOther = messages.some((m) => m.sender_role !== viewerRole && !m.read_at);
    if (!hasUnreadFromOther) return;
    lastMarkReadAtRef.current = now;
    markThreadReadAction(clientId);
  }, [clientId, messages, viewerRole]);

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
          queryClient.setQueryData<Message[]>(queryKey, (old = []) => {
            if (old.some((m) => m.id === row.id)) return old;
            return [...old, row].sort(sortByCreatedAt);
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `client_id=eq.${clientId}` },
        (payload) => {
          const row = payload.new as Message;
          queryClient.setQueryData<Message[]>(queryKey, (old = []) => old.map((m) => (m.id === row.id ? row : m)));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const send = useCallback(
    async (body: string) => {
      const tempId = `temp-${crypto.randomUUID()}`;
      const createdAt = new Date().toISOString();
      setPending((p) => [...p, { tempId, body, createdAt, status: "sending" }]);

      const result = await sendMessageAction(clientId, body);
      if (result?.error) {
        setPending((p) => p.map((m) => (m.tempId === tempId ? { ...m, status: "failed" } : m)));
      }
    },
    [clientId],
  );

  const retry = useCallback(
    async (tempId: string) => {
      const target = visiblePending.find((p) => p.tempId === tempId);
      if (!target) return;
      setPending((p) => p.map((m) => (m.tempId === tempId ? { ...m, status: "sending" } : m)));
      const result = await sendMessageAction(clientId, target.body);
      if (result?.error) {
        setPending((p) => p.map((m) => (m.tempId === tempId ? { ...m, status: "failed" } : m)));
      }
    },
    [clientId, visiblePending],
  );

  const dismiss = useCallback((tempId: string) => {
    setPending((p) => p.filter((m) => m.tempId !== tempId));
  }, []);

  const renderable = toRenderableMessages(messages, visiblePending, viewerRole);

  return { renderable, isLoading, send, retry, dismiss };
}
