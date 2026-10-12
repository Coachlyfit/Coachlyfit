// Minimal push-display service worker. No offline/caching behavior —
// the app is installable (manifest.ts) but online-only; the job here is showing a notification
// when the cron's web-push send wakes the browser, and routing a click
// to the right in-app URL.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const payload = event.data.json();
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/brand/favicon.png",
      data: { url: payload.url ?? "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(self.clients.openWindow(url));
});
