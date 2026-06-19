// Airclout Service Worker
// Caches the app shell for offline use & fast loads

const CACHE_NAME = 'airclout-v1';

// App shell — files to cache on install
const APP_SHELL = [
  '/Airclout/',
  '/Airclout/index.html',
  '/Airclout/manifest.json',
  '/Airclout/icons/icon-192.png',
  '/Airclout/icons/icon-512.png'
];

// External CDN resources to cache when first fetched
const CDN_CACHE_NAME = 'airclout-cdn-v1';

// ─── Install: cache the app shell ───────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell');
      return cache.addAll(APP_SHELL).catch((err) => {
        // Don't fail install if some shell files can't be fetched (e.g. icons missing)
        console.warn('[SW] Some shell files failed to cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate: remove old caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== CDN_CACHE_NAME)
          .map((k) => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch: serve from cache, fall back to network ──────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Don't cache camera/mic streams or API calls
  if (
    event.request.method !== 'GET' ||
    url.pathname.includes('/api/') ||
    url.href.includes('mediapipe') && url.href.includes('wasm') // skip wasm blobs
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // CDN resources — cache-first (they're versioned anyway)
  const isCDN = (
    url.hostname.includes('cdn.jsdelivr.net') ||
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  );

  if (isCDN) {
    event.respondWith(
      caches.open(CDN_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        } catch {
          return cached || new Response('', { status: 503 });
        }
      })
    );
    return;
  }

  // App shell — network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Update cache with fresh copy
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        return cached || caches.match('/Airclout/') || new Response('Offline', { status: 503 });
      })
  );
});
