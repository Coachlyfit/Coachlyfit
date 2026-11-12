"use client";

import { useEffect } from "react";
import { resetStuckRows } from "@/lib/offline/outbox";
import { setOnline, syncNow } from "@/lib/offline/sync";
import { SyncStatusBar } from "./sync-status-bar";

const USER_KEY = "coachly:offline-user";
const SYNC_INTERVAL_MS = 20_000;

/** Wires every sync trigger (none depends on Background Sync, which iOS
 * Safari lacks): app load, `online`, foregrounding (visibilitychange), a
 * timer that also serves the retry backoff, and — where the browser has it —
 * a message from the service worker's `sync` event. The manual "Sync now"
 * button lives in SyncStatusBar. Also registers the service worker, asks for
 * persistent storage and renders the status bar for the client layout. */
export function OfflineProvider({ userId }: { userId: string }) {
  useEffect(() => {
    setOnline(navigator.onLine);

    const sw = "serviceWorker" in navigator ? navigator.serviceWorker : null;
    // Cached pages belong to whoever was signed in; a different user on the
    // same device must not be served the previous user's workout from cache.
    try {
      const previous = localStorage.getItem(USER_KEY);
      if (previous && previous !== userId) {
        sw?.controller?.postMessage({ type: "CLEAR_USER_CACHES" });
        localStorage.removeItem("coachly:last-workout");
      }
      localStorage.setItem(USER_KEY, userId);
    } catch {
      // storage blocked: cache-clearing is best effort
    }

    sw?.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "SYNC_OUTBOX") void syncNow();
    };
    sw?.addEventListener("message", onSwMessage);

    try {
      void navigator.storage?.persist?.();
    } catch {
      // best effort
    }

    const onOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);

    void resetStuckRows().then(syncNow);

    return () => {
      sw?.removeEventListener("message", onSwMessage);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [userId]);

  return <SyncStatusBar showInstallHint />;
}
