const CACHE_NAME = "wine-order-count-static-v39";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./catalog.js",
  "./app.js",
  "./help.pdf",
  "./assets/help/user_guide.pdf",
  "./images.ico",
  "./xlsx.full.min.js",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.hostname.includes("supabase.co")) return;
  if (
    url.pathname.endsWith("app.js")
    || url.pathname.endsWith("index.html")
    || url.pathname.endsWith("styles.css")
    || url.pathname.endsWith("catalog.js")
  ) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      });
    }),
  );
});
