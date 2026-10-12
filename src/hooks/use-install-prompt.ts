"use client";

import { useEffect, useSyncExternalStore } from "react";

// Chromium-only (Chrome, Edge, Android). Safari/Firefox never fire it, so
// the install button simply stays hidden there (Safari users use
// "Add to Dock" / "Add to Home Screen").
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Module-level store: the event can fire once, before any component that
// cares about it mounts, so the listener lives outside React.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInstallPrompt() {
  const canInstall = useSyncExternalStore(
    subscribe,
    () => deferred !== null,
    () => false
  );

  // A registered service worker keeps the app installable across browsers.
  // sw.js only handles push (no caching), and register() is idempotent with
  // use-push-subscription's own call.
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  async function install() {
    if (!deferred) return;
    const event = deferred;
    await event.prompt();
    await event.userChoice;
    // A prompt event can only be used once.
    deferred = null;
    emit();
  }

  return { canInstall, install };
}
