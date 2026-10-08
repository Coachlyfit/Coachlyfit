import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { InboxThread } from "@/domain/messages/messages.service";
import { listInboxAction, listPresenceAction } from "@/domain/messages/messages-actions";

export const INBOX_QUERY_KEY = ["inbox-threads"] as const;

const INVALIDATE_DEBOUNCE_MS = 500;
// The heartbeat behind last_seen_at is itself ~60s, so polling faster would
// only re-read the same value.
const PRESENCE_REFETCH_MS = 60_000;

/** The coach's conversation summaries. One query shared by the messages
 * list and the nav unread badges; <InboxRealtime> keeps it fresh. */
export function useInboxThreads(initialThreads?: InboxThread[]) {
  const { data = [] } = useQuery({
    queryKey: INBOX_QUERY_KEY,
    queryFn: () => listInboxAction(),
    initialData: initialThreads,
  });
  return data;
}

/** Subscribes once (mount it once per layout) to the coach's messages and
 * refreshes the shared inbox query: INSERT for new messages, UPDATE for read
 * receipts in both directions. RLS scopes what realtime delivers, so there
 * is no filter to get wrong here. */
export function useInboxRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    // A broadcast or a mark-thread-read touches many rows at once.
    function invalidate() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEY }), INVALIDATE_DEBOUNCE_MS);
    }
    const channel = supabase
      .channel("inbox:messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, invalidate)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, invalidate)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

/** Online / last-seen per client id, from the profiles.last_seen_at
 * heartbeat (online = seen in the last few minutes anywhere in the app). */
export function useClientPresence() {
  const { data = {} } = useQuery({
    queryKey: ["client-presence"],
    queryFn: () => listPresenceAction(),
    refetchInterval: PRESENCE_REFETCH_MS,
  });
  return data;
}
