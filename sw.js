const CACHE = 'investsmart-v5';
const BASE = '/pruebas';
const SHELL = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/styles.css',
  BASE + '/manifest.json',
  BASE + '/icons/icon.svg',
  BASE + '/icons/icon-maskable.svg',
  BASE + '/src/config.js',
  BASE + '/src/utils.js',
  BASE + '/src/sync.js',
  BASE + '/src/assets.js',
  BASE + '/src/store.js',
  BASE + '/src/auth.js',
  BASE + '/src/learn.js',
  BASE + '/src/charts.js',
  BASE + '/src/ui.js',
  BASE + '/src/prices.js',
  BASE + '/src/ai.js',
  BASE + '/src/buy.js',
  BASE + '/src/positions.js',
  BASE + '/src/per.js',
  BASE + '/src/onboarding.js',
  BASE + '/src/app.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Skip cross-origin requests (CDN, Supabase API)
  if (url.origin !== self.location.origin) return;
  // Skip Supabase Edge Function calls
  if (url.pathname.includes('/functions/v1/')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      // Stale-while-revalidate: serve cache immediately, update in background
      if (cached) {
        fetch(event.request).then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            caches.open(CACHE).then(c => c.put(event.request, res));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request).then(res => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(event.request, clone));
        return res;
      });
    })
  );
});
