/* =================================================================== */
/* ===       Service Worker para Listopic (Versión Blindada)        === */
/* =================================================================== */

const CACHE_NAME = 'listopic-cache-v2'; // Incrementamos la versión para forzar la actualización
const urlsToCacheOnInstall = [
  '/',
  'index.html',
  'archive.html',
  'search.html',
  'style.css',
  'js/main.js',
  'img/listopic-logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCacheOnInstall))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (!request.url.startsWith('http')) {
    return;
  }

  if (request.method !== 'GET') {
    return;
  }

  if (
    request.url.includes('firestore.googleapis.com') ||
    request.url.includes('identitytoolkit.googleapis.com') ||
    request.url.includes('.algolia.net')
  ) {
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);

    const fetchAndUpdate = async () => {
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        if (cachedResponse) {
          return cachedResponse;
        }

        if (request.destination === 'image') {
          const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="100%" height="100%" fill="#1f2933"/><text x="50%" y="50%" fill="#cbd5e1" font-size="24" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle">Imagen no disponible</text></svg>`;
          return new Response(fallbackSvg, {
            headers: {
              'Content-Type': 'image/svg+xml'
            },
            status: 200
          });
        }

        return new Response('Contenido no disponible sin conexión.', {
          status: 503,
          statusText: 'Offline'
        });
      }
    };

    if (cachedResponse) {
      fetchAndUpdate().catch(() => {});
      return cachedResponse;
    }

    return fetchAndUpdate();
  })());
});
