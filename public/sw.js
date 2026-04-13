const CACHE_NAME = "tamilanda-bm-v4";

const PRECACHE_ASSETS = [
  "/",
  "/logo.jpg",
  "/favicon.svg",
  "/manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
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
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept: API calls, Vite dev server resources, websockets, source maps
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/@vite") ||
    url.pathname.startsWith("/@fs") ||
    url.pathname.startsWith("/src/") ||
    url.pathname.startsWith("/node_modules/") ||
    url.pathname.endsWith(".map") ||
    url.searchParams.has("v") ||
    request.url.includes("__vite")
  ) {
    event.respondWith(fetch(request));
    return;
  }

  // Network-first for HTML pages
  if (request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Network-first for production hashed assets (fallback to cache if offline)
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});
