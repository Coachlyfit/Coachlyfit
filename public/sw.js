// Coachly Fit service worker. Two jobs:
//  1. Web push: show the notification, route its click (unchanged).
//  2. Offline support for the client's workout runner: cache the app shell
//     assets and the workout pages a client has actually opened, so the
//     logging screen reopens with no signal. The logs themselves are queued
//     in IndexedDB by the page (src/lib/offline) — this file only caches code
//     and HTML, and never answers anything but GET navigations and static assets.
//
// Hand-written on purpose: Serwist needs a webpack build and this app builds
// with Turbopack (see Next's PWA guide, "Extending your PWA").

const VERSION = "v1";
const STATIC_CACHE = `coachly-static-${VERSION}`;
const PAGES_CACHE = `coachly-pages-${VERSION}`;
const LOCALES = ["ar", "en"];
const NETWORK_TIMEOUT_MS = 4000;

// Only pages a client opened are cached (never prefetched: rendering a workout
// page creates its workout_sessions row). The runner is /c/workout/<day id>.
const CACHEABLE_PAGE = /^\/(ar|en)\/c(\/(plan|workout\/[^/]+))?\/?$/;
const STATIC_PATH = /^\/(_next\/static|brand)\//;
// "/_next/static/chunks/x.js" in <script> tags, "static/chunks/x.js" inside the
// RSC payload — both name chunks a lazily-opened sheet may need offline.
const ASSET_REF = /(?:\/_next\/)?static\/[\w\-./%~]+\.(?:js|css)/g;
// next dev serves unhashed chunk names, so cache-first would pin stale code.
const IS_LOCAL = ["localhost", "127.0.0.1"].includes(self.location.hostname);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const pages = await caches.open(PAGES_CACHE);
      // Offline fallback page, per locale. allSettled: a failed warm-up must
      // not block installing the push worker.
      await Promise.allSettled(LOCALES.map((l) => storePage(pages, `/${l}/offline`, fetch(`/${l}/offline`))));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, PAGES_CACHE]);
      for (const key of await caches.keys()) if (key.startsWith("coachly-") && !keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // server actions / mutations always go to the network
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (STATIC_PATH.test(url.pathname)) {
    event.respondWith(IS_LOCAL ? networkFirst(request) : cacheFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(navigate(event, request, url));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

function fetchWithTimeout(request, ms) {
  if (!ms) return fetch(request);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(request).then(
      (res) => (clearTimeout(timer), resolve(res)),
      (err) => (clearTimeout(timer), reject(err))
    );
  });
}

// Network first, so the page (and its server-side session resume) is always
// fresh when there is signal; the cached copy is only for when there isn't.
async function navigate(event, request, url) {
  const cache = await caches.open(PAGES_CACHE);
  const cacheable = CACHEABLE_PAGE.test(url.pathname);
  const cached = cacheable ? await cache.match(request.url, { ignoreSearch: true, ignoreVary: true }) : undefined;
  try {
    const res = await fetchWithTimeout(request, cached ? NETWORK_TIMEOUT_MS : 0);
    // Redirects (to login, /expired, ...) come back opaque or redirected: never cached.
    if (cacheable && res.ok && !res.redirected) event.waitUntil(storePage(cache, request.url, Promise.resolve(res.clone())));
    return res;
  } catch {
    if (cached) return cached;
    const locale = LOCALES.includes(url.pathname.split("/")[1]) ? url.pathname.split("/")[1] : LOCALES[0];
    return (await cache.match(`/${locale}/offline`, { ignoreVary: true })) || Response.error();
  }
}

async function storePage(cache, key, responsePromise) {
  const res = await responsePromise;
  if (!res.ok || res.redirected) return;
  await cache.put(key, res.clone());
  await warmAssets(await res.text());
}

// Pre-fetch the chunks a page references so its lazily-opened sheets also work offline.
async function warmAssets(html) {
  const urls = new Set();
  for (const match of html.matchAll(ASSET_REF)) urls.add(`/_next/${match[0].replace(/^\/_next\//, "")}`);
  const cache = await caches.open(STATIC_CACHE);
  await Promise.allSettled(
    [...urls].map(async (asset) => {
      if (await cache.match(asset, { ignoreSearch: true })) return;
      const res = await fetch(asset);
      if (res.ok) await cache.put(asset, res);
    })
  );
}

self.addEventListener("message", (event) => {
  // Sent by the page when a different user signs in on this device.
  if (event.data?.type !== "CLEAR_USER_CACHES") return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGES_CACHE);
      for (const req of await cache.keys()) if (!new URL(req.url).pathname.endsWith("/offline")) await cache.delete(req);
    })()
  );
});

// Background Sync (Chromium only) is a bonus: it wakes an open page to drain
// the IndexedDB outbox. The page also syncs on load, `online`, foregrounding
// and a manual button, so nothing depends on this event firing.
self.addEventListener("sync", (event) => {
  if (event.tag !== "outbox-sync") return;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window" })
      .then((clients) => clients.forEach((client) => client.postMessage({ type: "SYNC_OUTBOX" })))
  );
});

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
