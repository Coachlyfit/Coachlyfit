"use client";

import { useEffect, useState } from "react";
import { subscribePushAction, unsubscribePushAction } from "@/lib/notifications/push-actions";

// Base64url VAPID public key -> Uint8Array, the shape applicationServerKey
// requires (pushManager.subscribe won't accept the raw string).
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Push is opt-in per browser/device (no subscription = no toggle state to
 * restore from the server on load — checking permission + an existing
 * PushManager subscription is the only source of truth). Not supported
 * when the VAPID key isn't configured or the browser lacks Push API. */
// Reads only stable globals (env var baked in at build, browser feature
// presence) — never changes after mount, so it's safe as a lazy initial
// state instead of an effect-driven setState.
function pushSupported() {
  if (typeof window === "undefined") return false;
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return false;
  return "serviceWorker" in navigator && "PushManager" in window;
}

export function usePushSubscription() {
  const [supported] = useState(pushSupported);
  const [subscribed, setSubscribed] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.register("/sw.js").then(async (registration) => {
      const existing = await registration.pushManager.getSubscription();
      setSubscribed(existing !== null);
    });
  }, [supported]);

  async function toggle() {
    setPending(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      if (subscribed) {
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          await unsubscribePushAction(existing.endpoint);
          await existing.unsubscribe();
        }
        setSubscribed(false);
        return;
      }

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys?.auth) throw new Error("missing_keys");
      await subscribePushAction({ endpoint: subscription.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth });
      setSubscribed(true);
    } finally {
      setPending(false);
    }
  }

  return { supported, subscribed, pending, toggle };
}
