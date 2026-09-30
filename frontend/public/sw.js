// v5: purga cachés antiguas que pudieron guardar index.html como si fuera un
// script (cuando un trozo de una versión anterior ya no existía).
const CACHE_NAME = 'listopic-shell-v5';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/default_favicon.svg',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // In local development, Vite frequently replaces chunks during HMR.
  // Let the dev server handle requests directly to avoid stale cached assets.
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;

  // Skip Firebase Auth reserved paths
  if (url.pathname.startsWith('/__/auth/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) return response;
        return caches.open(CACHE_NAME).then((cache) => cache.match('/index.html')).then((fallback) => fallback || response);
      }).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return cache.match('/index.html');
      }),
    );
    return;
  }

  if (request.destination === 'script' || request.destination === 'style' || request.destination === 'worker') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // Si en lugar de JS/CSS llega HTML (ruta reescrita a index.html), no
          // se guarda ni se entrega como script: se devuelve un error para que
          // la app detecte la versión nueva y recargue.
          const contentType = networkResponse.headers.get('content-type') || '';
          if (networkResponse.ok && contentType.includes('text/html')) {
            return new Response('', { status: 404, statusText: 'Asset not found' });
          }
          if (networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          return new Response('', {
            status: 503,
            statusText: 'Asset unavailable offline',
          });
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkFetch = fetch(request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkFetch;
    }),
  );
});
