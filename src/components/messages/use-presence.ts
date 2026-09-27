import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type ViewerRole = "coach" | "client";

/** Joins a per-thread Presence channel (no DB table — Realtime tracks join/
 * leave in memory) and derives whether the other party is currently on this
 * same thread. Also carries the typing Broadcast channel so use-typing can
 * reuse the same socket instead of opening a second one. */
export function usePresence(clientId: string, viewerRole: ViewerRole) {
  const [otherOnline, setOtherOnline] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<Date | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const otherRolePrefixRef = useRef(`${viewerRole === "coach" ? "client" : "coach"}:`);

  useEffect(() => {
    otherRolePrefixRef.current = `${viewerRole === "coach" ? "client" : "coach"}:`;
  }, [viewerRole]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function join() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      const ch = supabase.channel(`presence:messages:${clientId}`, {
        config: { presence: { key: `${viewerRole}:${user.id}` } },
      });

      ch.on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        const hasOther = Object.keys(state).some((key) => key.startsWith(otherRolePrefixRef.current));
        setOtherOnline(hasOther);
        if (hasOther) setLastSeenAt(null);
      }).on("presence", { event: "leave" }, ({ key }: { key: string }) => {
        if (key.startsWith(otherRolePrefixRef.current)) {
          setOtherOnline(false);
          setLastSeenAt(new Date());
        }
      });

      ch.subscribe(async (status) => {
        if (status === "SUBSCRIBED" && !cancelled) {
          await ch.track({ role: viewerRole, online_at: new Date().toISOString() });
        }
      });

      if (!cancelled) setChannel(ch);
      else supabase.removeChannel(ch);
    }

    join();

    return () => {
      cancelled = true;
      setChannel((current) => {
        if (current) {
          current.untrack();
          supabase.removeChannel(current);
        }
        return null;
      });
    };
  }, [clientId, viewerRole]);

  return { otherOnline, lastSeenAt, channel };
}
