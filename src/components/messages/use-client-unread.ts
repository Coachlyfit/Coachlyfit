import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { countUnreadCoachMessagesAction } from "@/domain/messages/messages-actions";

export const CLIENT_UNREAD_QUERY_KEY = ["client-unread-messages"] as const;

const INVALIDATE_DEBOUNCE_MS = 500;

/** Unread coach messages for the client nav badge. Seeded from the layout's
 * server count; realtime (RLS-scoped) refreshes it on new messages and
 * read receipts. */
export function useClientUnread(initialCount: number) {
  const queryClient = useQueryClient();
  const { data = 0 } = useQuery({
    queryKey: CLIENT_UNREAD_QUERY_KEY,
    queryFn: countUnreadCoachMessagesAction,
    initialData: initialCount,
  });

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    function invalidate() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(
        () => queryClient.invalidateQueries({ queryKey: CLIENT_UNREAD_QUERY_KEY }),
        INVALIDATE_DEBOUNCE_MS,
      );
    }
    const channel = supabase
      .channel("client-nav:messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, invalidate)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, invalidate)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return data;
}
