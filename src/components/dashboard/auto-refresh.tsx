"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

const REFRESH_INTERVAL_MS = 60_000;

/** Re-runs the server component tree on an interval so an online-users list
 * (5-minute window) stays roughly current without a websocket. Polling
 * only, and only while the tab is visible -- a background tab doesn't
 * spend cycles re-fetching a list nobody's looking at. */
export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    function tick() {
      if (document.visibilityState === "visible") router.refresh();
    }

    const interval = setInterval(tick, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);

  return null;
}
