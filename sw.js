// sw.js - Service Worker for PWA and caching
const CACHE_VERSION = "v2.2.2";
const CACHE_NAME = `flixtris-${CACHE_VERSION}`;

// Files to cache
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/landing.html",
  "/about.html",
  "/manifest.json",
  "/css/styles.css",
  "/css/site.css",
  "/js/db.js",
  "/js/sound.js",
  "/js/game.js",
  "/js/bot.js",
  "/js/multiplayer.js",
  "/js/ui.js",
  "/js/screens.js",
  "/js/settings.js",
  "/js/leaderboard.js",
  "/js/tournament.js",
  "/js/tournament-ui.js",
  "/js/updates.js",
  "/js/site.js",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Install event - cache static assets
self.addEventListener("install", (event) => {
  console.log("Service Worker installing...");

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Caching static assets");
      // cache: "reload" skips the HTTP cache, so a new version never
      // precaches stale copies of the files it is meant to replace.
      return cache.addAll(
        STATIC_ASSETS.map((url) => new Request(url, { cache: "reload" })),
      );
    }),
  );

  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("Service Worker activating...");

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );

  // Claim all clients immediately
  return self.clients.claim();
});

// Fetch strategy:
// - Only same-origin GETs are handled; /api and the WebSocket never are.
// - Pages, scripts, styles and JSON: network first, so a deploy shows up on
//   the next load; the cache is the offline fallback.
// - Everything else (icons, images): cache first.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/health") return;

  const isCode =
    request.mode === "navigate" ||
    /\.(html|js|css|json)$/.test(url.pathname) ||
    url.pathname === "/";

  if (isCode) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request, { ignoreSearch: true })
            .then((cached) => cached || caches.match("/index.html")),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response && response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

// Listen for skip waiting message
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
