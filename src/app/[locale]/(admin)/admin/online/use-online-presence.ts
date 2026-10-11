import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ONLINE_TOPIC } from "@/domain/presence/presence-status";

/** Listens (never tracks) on the private presence topic every signed-in
 * coach and client tracks from PresenceHeartbeat. Keys are user ids. Only an
 * admin receives the state -- for anyone else the realtime.messages policy
 * delivers nothing, so the set just stays empty. */
export function useOnlinePresence() {
  const [onlineIds, setOnlineIds] = useState<ReadonlySet<string>>(() => new Set());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(ONLINE_TOPIC, { config: { private: true } });

    channel
      .on("presence", { event: "sync" }, () => {
        setOnlineIds(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return { onlineIds, connected };
}
