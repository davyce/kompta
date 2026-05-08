/* KOMPTA Service Worker v2 — Cache-first for assets, network-first for API */
const CACHE_NAME = "kompta-v2";
const API_PREFIX = "/api";

// Static assets to pre-cache
const PRECACHE_URLS = [
  "/",
  "/index.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API calls — network first, no caching for mutations
  if (url.pathname.startsWith(API_PREFIX)) {
    if (event.request.method !== "GET") return; // don't intercept mutations
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request)) // offline: serve stale
    );
    return;
  }

  // Static assets — cache first
  if (event.request.method === "GET") {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok && !url.pathname.startsWith("/api")) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  }
});

// Background sync for offline mutations (basic implementation)
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-transactions") {
    // Could be extended to replay queued mutations
    console.log("[SW] Background sync: sync-transactions");
  }
});

// Receive sync signal from the page to broadcast back to all clients
self.addEventListener("message", (e) => {
  if (e.data?.type === "OFFLINE_SALES_SYNCED") {
    self.clients.matchAll().then((clients) => {
      clients.forEach((c) => c.postMessage({ type: "SYNC_DONE", count: e.data.count }));
    });
  }
});
