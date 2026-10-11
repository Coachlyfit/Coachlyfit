"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { touchPresenceAction } from "@/domain/presence/presence-actions";
import { ONLINE_TOPIC } from "@/domain/presence/presence-status";

const HEARTBEAT_INTERVAL_MS = 60_000;

/** Renders nothing -- mounted once per authenticated layout ((coach), (c),
 * (admin)) to keep profiles.last_seen_at fresh. Touches on mount, every 60s
 * while the tab is visible, and immediately when the tab regains
 * visibility (so switching back to a stale background tab doesn't wait out
 * a full interval before counting as online again).
 *
 * With `realtime` it also tracks the user on the private presence topic the
 * admin "Online now" page listens to (20261011000003_admin_online.sql: any
 * signed-in user may track, only admins receive the state). The (admin)
 * layout turns it off: admins aren't counted, and the page owns that topic's
 * channel itself -- a client can only hold one channel per topic. */
export function PresenceHeartbeat({ realtime = true }: { realtime?: boolean }) {
  useEffect(() => {
    function touch() {
      if (document.visibilityState === "visible") void touchPresenceAction();
    }

    touch();
    const interval = setInterval(touch, HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", touch);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", touch);
    };
  }, []);

  useEffect(() => {
    if (!realtime) return;
    let cancelled = false;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function join() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      channel = supabase.channel(ONLINE_TOPIC, { config: { private: true, presence: { key: user.id } } });
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") void channel?.track({});
      });
    }

    void join();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [realtime]);

  return null;
}
