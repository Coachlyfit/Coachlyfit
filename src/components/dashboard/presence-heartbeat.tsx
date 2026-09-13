"use client";

import { useEffect } from "react";
import { touchPresenceAction } from "@/domain/presence/presence-actions";

const HEARTBEAT_INTERVAL_MS = 60_000;

/** Renders nothing -- mounted once per authenticated layout ((coach), (c),
 * (admin)) to keep profiles.last_seen_at fresh. Touches on mount, every 60s
 * while the tab is visible, and immediately when the tab regains
 * visibility (so switching back to a stale background tab doesn't wait out
 * a full interval before counting as online again). */
export function PresenceHeartbeat() {
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

  return null;
}
