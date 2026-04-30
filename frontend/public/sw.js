const CACHE = "kompta-v1";
const API_BASE = "http://127.0.0.1:8010/api";

// App-shell files to pre-cache
const PRECACHE = ["/", "/index.html"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Cache-then-network for the products API
  if (url.href.startsWith(API_BASE + "/products") && request.method === "GET") {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Network-first with cache fallback for static assets
  if (request.destination === "script" || request.destination === "style") {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
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
