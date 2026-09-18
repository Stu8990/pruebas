const CACHE = 'investsmart-v33';
const BASE = '/pruebas';
const SHELL = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/styles.css',
  BASE + '/manifest.json',
  BASE + '/icons/icon.svg',
  BASE + '/icons/icon-maskable.svg',
  BASE + '/icons/icon-192.png',
  BASE + '/icons/apple-touch-icon.png',
  BASE + '/src/config.js',
  BASE + '/src/auth.js',
  BASE + '/src/data.js',
  BASE + '/src/model.js',
  BASE + '/src/format.js',
  BASE + '/src/app.js',
  BASE + '/src/core/portfolio.js',
  BASE + '/src/core/advice.js',
  BASE + '/src/core/trades.js',
  BASE + '/src/ui/sheet.js',
  BASE + '/src/ui/chart.js',
  BASE + '/src/views/home.js',
  BASE + '/src/views/holdings.js',
  BASE + '/src/views/plan.js',
  BASE + '/src/views/more.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    // cache: 'reload' salta la caché HTTP del navegador. GitHub Pages marca
    // todo con max-age=600: sin esto, una versión nueva podía guardarse con
    // el CSS o el JS de la anterior (HTML nuevo + estilos viejos = pantalla
    // descuadrada al refrescar).
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
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
        fetch(event.request, { cache: 'no-cache' }).then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            caches.open(CACHE).then(c => c.put(event.request, res));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request, { cache: 'no-cache' }).then(res => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(event.request, clone));
        return res;
      });
    })
  );
});
