// Easter Hunt — Service Worker
// Caches map tiles for the Crystal Palace Park area and the app shell,
// so the app works correctly after page eviction and in poor signal.

const TILE_CACHE = 'easter-tiles-v1';
const APP_CACHE  = 'easter-app-v1';
const API_KEY    = '2a3bce50-576d-4694-abff-ae82591547d0';
const BASE_URL   = 'https://tiles.stadiamaps.com/tiles/stamen_watercolor';

// Pre-calculated tile ranges for Crystal Palace Park (zoom 14–17)
// Bounds: SW [51.4185, -0.0800] / NE [51.4270, -0.0620]
const ZOOM_RANGES = [
  { z: 14, xMin: 8188,  xMax: 8189,  yMin: 5453,  yMax: 5454  },
  { z: 15, xMin: 16376, xMax: 16378, yMin: 10907, yMax: 10909 },
  { z: 16, xMin: 32753, xMax: 32756, yMin: 21815, yMax: 21818 },
  { z: 17, xMin: 65506, xMax: 65513, yMin: 43631, yMax: 43636 },
];

function getTileUrls() {
  const urls = [];
  for (const { z, xMin, xMax, yMin, yMax } of ZOOM_RANGES) {
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        urls.push(`${BASE_URL}/${z}/${x}/${y}.jpg?api_key=${API_KEY}`);
        urls.push(`${BASE_URL}/${z}/${x}/${y}@2x.jpg?api_key=${API_KEY}`);
      }
    }
  }
  return urls;
}

// ── Install: pre-cache all park tiles ───────────────────────

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(TILE_CACHE).then(cache => {
      const urls = getTileUrls();
      // allSettled: a single failed tile doesn't abort SW installation
      return Promise.allSettled(
        urls.map(url =>
          fetch(url, { credentials: 'omit' })
            .then(res => { if (res.ok) return cache.put(url, res); })
            .catch(() => { /* network unavailable during install — will cache on first fetch */ })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean up stale caches ─────────────────────────

self.addEventListener('activate', event => {
  const current = new Set([TILE_CACHE, APP_CACHE]);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !current.has(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for tiles, network-first for app shell

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = request.url;

  // Tile requests: cache-first, then network (and cache the result)
  if (url.includes('tiles.stadiamaps.com')) {
    event.respondWith(
      caches.open(TILE_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request, { credentials: 'omit' }).then(res => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // App shell (HTML, CSS, JS): network-first, fall back to cache
  if (request.method === 'GET') {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            caches.open(APP_CACHE).then(cache => cache.put(request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
  }
});
