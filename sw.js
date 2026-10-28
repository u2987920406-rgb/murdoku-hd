// Clu&Do service worker: cache-first app shell, so the game installs and plays
// offline after the first visit. Bump VERSION whenever a shipped file changes:
// the new worker re-caches everything, takes over at once (skipWaiting +
// clients.claim) and deletes the previous cache.
const VERSION = 'cludo-v1';

const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'floorplan.js',
  'clues.js',
  'cases.json',
  'manifest.webmanifest',
  'assets/ui/emblem.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
];

// Art the board shows: cached too, so an offline game still has its faces.
const ART = [
  ...['anais', 'bastien', 'camille', 'etienne', 'helene', 'ines', 'julien', 'karim',
    'lucie', 'marc', 'maud', 'nadia', 'roxane', 'sofia', 'theo', 'victor'].map((name) => `assets/portraits/${name}.svg`),
  ...['aubert', 'delaunay', 'legoff', 'molina', 'rousseau', 'vasseur'].map((name) => `assets/victims/${name}.svg`),
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // One by one: a missing file is skipped (and fetched from the network
    // later) instead of failing the whole install.
    await Promise.all([...SHELL, ...ART].map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== VERSION).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') cache.put(request, response.clone());
      return response;
    } catch (error) {
      // Offline and not cached: a navigation still gets the game page.
      if (request.mode === 'navigate') {
        const page = await cache.match('index.html');
        if (page) return page;
      }
      throw error;
    }
  })());
});
