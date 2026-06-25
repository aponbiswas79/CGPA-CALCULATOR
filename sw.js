/**
 * CG-CAL Service Worker
 * =====================
 * Strategy: Cache-first for app shell assets, network-first for CDN resources.
 *
 * On install:  Pre-cache the app HTML (offline shell).
 * On fetch:    Serve from cache if available, otherwise fetch from network.
 *              CDN requests (fonts, Chart.js, html2pdf) always go to network first
 *              so you always get the latest version when online.
 *
 * To update the cache: increment CACHE_VERSION below and redeploy.
 */

const CACHE_VERSION = 'cgcal-v1';

// Core app shell files to pre-cache on install
// Update this list if you rename or add HTML/CSS/JS files
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
];

// CDN domains — always fetched from network when online (no caching)
const CDN_HOSTS = [
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

/* -------------------------------------------------------
   INSTALL — pre-cache the app shell
------------------------------------------------------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      console.log('[SW] Pre-caching app shell...');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      // Immediately activate the new SW without waiting for old tabs to close
      return self.skipWaiting();
    })
  );
});

/* -------------------------------------------------------
   ACTIVATE — clean up old caches from previous versions
------------------------------------------------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_VERSION) // delete old caches
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      // Take control of all open pages immediately
      return self.clients.claim();
    })
  );
});

/* -------------------------------------------------------
   FETCH — serve from cache or network
------------------------------------------------------- */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (POST, etc.)
  if (event.request.method !== 'GET') return;

  // CDN resources: network first, no caching (always fresh)
  if (CDN_HOSTS.some(host => url.hostname.includes(host))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // App shell: cache first, fall back to network
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Serve from cache (offline capable)
        return cachedResponse;
      }
      // Not in cache — fetch from network and cache for next time
      return fetch(event.request).then((networkResponse) => {
        // Only cache valid responses from our own origin
        if (networkResponse && networkResponse.status === 200 && url.origin === self.location.origin) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
        // Offline and not in cache — return a friendly offline page if HTML was requested
        if (event.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
