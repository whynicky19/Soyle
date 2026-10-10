const CACHE = "soyle-core-v7";
const CORE = [
  "/", "/app", "/soyle-mark-v2.png", "/illustrations/apple.png", "/illustrations/ball.png",
  "/illustrations/cat.png", "/illustrations/juice.png", "/illustrations/love.png",
  "/illustrations/me.png", "/illustrations/mom.png", "/illustrations/dad.png",
  "/illustrations/want.png", "/illustrations/see.png", "/illustrations/mascot-parrot.png",
  "/illustrations/mascot-parrot-headphones.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.pathname.startsWith("/api/") || event.request.headers.has("authorization")) return;
  event.respondWith(fetch(event.request).then((response) => {
    const cacheControl = response.headers.get("cache-control") || "";
    if (response.ok && requestUrl.origin === self.location.origin && !/(private|no-store)/i.test(cacheControl)) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request).then((cached) => {
    if (cached) return cached;
    if (event.request.mode !== "navigate") return Response.error();
    const pathname = new URL(event.request.url).pathname;
    return caches.match(pathname.startsWith("/app") ? "/app" : "/");
  })));
});
