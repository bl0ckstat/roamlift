/* RoamLift service worker: offline app shell + exercise image cache.
   Shell is network-first (updates win, cache is the offline fallback);
   demo images are cache-first (immutable). API calls are never cached. */
"use strict";

const VERSION = "roamlift-v1";
const SHELL = ["/", "/static/app.js", "/static/style.css", "/manifest.json",
               "/static/icon-192.png", "/static/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // live data only

  if (url.pathname.startsWith("/img/")) {
    // demo images never change: cache-first
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
        if (r.ok) {
          const copy = r.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return r;
      }))
    );
    return;
  }

  // app shell: network-first with cache fallback
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) {
        const copy = r.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
      }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
