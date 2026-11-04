/*
 * Tiktoe service worker (production only; registered as /sw.js?v=<build id>).
 *
 * - Pages and same-origin requests: network-first, so nobody is ever stuck on an old version.
 *   The cache is only a fallback when offline.
 * - /_next/static/*: cache-first. These files are content-hashed, so a new deploy has new names.
 * - Other origins (Supabase REST, Auth, Realtime, Storage) are NEVER intercepted or cached.
 * - /api/* is never cached (e.g. /api/version must always be fresh).
 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "0";
const PAGES = `tiktoe-pages-${VERSION}`;
const STATIC = `tiktoe-static-${VERSION}`;
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== PAGES && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const cacheable = (res) => res && res.ok && res.type === "basic";

async function networkFirst(request, fallbackToOffline) {
  try {
    const res = await fetch(request);
    if (cacheable(res)) {
      const copy = res.clone();
      caches.open(PAGES).then((c) => c.put(request, copy));
    }
    return res;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackToOffline) return caches.match(OFFLINE);
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (cacheable(res)) {
    const copy = res.clone();
    caches.open(STATIC).then((c) => c.put(request, copy));
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase and every other origin: hands off
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return; // always live

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request, request.mode === "navigate"));
  }
});
