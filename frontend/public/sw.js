/* KOMPTA Service Worker — auto-unregister en dev, cache-first en prod */

const IS_DEV = self.location.hostname === "127.0.0.1" || self.location.hostname === "localhost";

if (IS_DEV) {
  // En développement : vider tous les caches et se désinscrire immédiatement
  self.addEventListener("install", () => {
    self.skipWaiting();
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .then(() => self.registration.unregister())
    );
    self.clients.claim();
  });

} else {
  /* ── PRODUCTION : Cache-first pour assets, network-first pour API ── */
  const CACHE_NAME = "kompta-v3";
  const PRECACHE_URLS = ["/", "/index.html"];

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
    if (url.pathname.startsWith("/api")) {
      if (event.request.method !== "GET") return;
      event.respondWith(
        fetch(event.request)
          .then((r) => {
            if (r.ok) caches.open(CACHE_NAME).then((c) => c.put(event.request, r.clone()));
            return r;
          })
          .catch(() => caches.match(event.request))
      );
      return;
    }
    if (event.request.method === "GET") {
      event.respondWith(
        caches.match(event.request).then((cached) =>
          cached || fetch(event.request).then((r) => {
            if (r.ok) caches.open(CACHE_NAME).then((c) => c.put(event.request, r.clone()));
            return r;
          })
        )
      );
    }
  });
}
