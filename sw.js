// sw.js - Service Worker for PWA and caching
const CACHE_VERSION = "v1.1.0";
const CACHE_NAME = `flixtris-${CACHE_VERSION}`;

// Files to cache
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/css/styles.css",
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
      return cache.addAll(STATIC_ASSETS);
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

// Fetch event - serve from cache, fallback to network
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Return cached response if found
      if (cachedResponse) {
        return cachedResponse;
      }

      // Otherwise fetch from network
      return fetch(event.request).then((response) => {
        // Don't cache non-successful responses
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();

        // Cache the new response
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      });
    }),
  );
});

// Listen for skip waiting message
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
