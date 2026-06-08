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
  /* ── PRODUCTION ──────────────────────────────────────────────────────────
   * - HTML / navigation : NETWORK-FIRST → on sert toujours le dernier index.html,
   *   donc les bons hash d'assets après un redéploiement (fini l'écran blanc).
   * - Assets hashés (/assets/*) : cache-first (immuables, nom unique par build).
   * - API : network-first avec repli cache hors-ligne.
   * Bump du nom de cache à chaque changement de stratégie → purge l'ancien.
   */
  const CACHE_NAME = "kompta-v6";
  const PRECACHE_URLS = ["/index.html"];
  const OFFLINE_API_HEADERS = { "Content-Type": "application/json", "X-KOMPTA-Offline": "1" };

  self.addEventListener("install", (event) => {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
    );
    self.skipWaiting();
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
        .then(() => self.clients.claim())
    );
  });

  self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;
    const url = new URL(request.url);

    // API → network-first
    if (url.pathname.startsWith("/api")) {
      event.respondWith(
        fetch(request)
          .then((r) => {
            if (r.ok) caches.open(CACHE_NAME).then((c) => c.put(request, r.clone()));
            return r;
          })
          .catch(() =>
            caches.match(request).then((cached) =>
              cached || new Response(
                JSON.stringify({
                  detail: "Connexion indisponible. Les donnees cachees ou les ventes POS en file restent disponibles localement.",
                  code: "offline",
                }),
                { status: 503, headers: OFFLINE_API_HEADERS }
              )
            )
          )
      );
      return;
    }

    // Navigation / HTML → network-first (toujours le dernier index.html)
    const isHtml = request.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith(".html");
    if (isHtml) {
      event.respondWith(
        fetch(request)
          .then((r) => {
            if (r.ok) caches.open(CACHE_NAME).then((c) => c.put("/index.html", r.clone()));
            return r;
          })
          .catch(() => caches.match(request).then((c) => c || caches.match("/index.html")))
      );
      return;
    }

    // Assets hashés → cache-first
    event.respondWith(
      caches.match(request).then((cached) =>
        cached || fetch(request).then((r) => {
          if (r.ok) caches.open(CACHE_NAME).then((c) => c.put(request, r.clone()));
          return r;
        })
      )
    );
  });
}
