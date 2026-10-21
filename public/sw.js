// Service worker (Part 14 REQ-FIELD-F05; A-114, A-126). Minimal and hand-written, with no third-party code.
// Policy: only the offline page, the manifest, the icons and hashed static assets are cached. HTML is never cached, so a shared or kiosk
// device cannot show one person's page to the next person offline. API responses are never cached or intercepted.
const SW_VERSION = "erp-sw-v1";
const SHELL_CACHE = `${SW_VERSION}-shell`;
const STATIC_CACHE = `${SW_VERSION}-static`;
const KNOWN_CACHES = [SHELL_CACHE, STATIC_CACHE];
const PRECACHE = ["/offline.html", "/manifest.webmanifest", "/icons/icon.svg"];

function isApi(url) {
  return url.pathname.startsWith("/api/");
}

function isStatic(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/icons/");
}

async function navigate(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const offline = await caches.match("/offline.html");
    return offline || new Response("You are offline.", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !KNOWN_CACHES.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApi(url)) return;
  if (request.mode === "navigate") {
    event.respondWith(navigate(request));
    return;
  }
  if (isStatic(url)) event.respondWith(cacheFirst(request));
});
