/* =================================================================== */
/* ===       Service Worker para Listopic (Versión Blindada)        === */
/* =================================================================== */

const CACHE_NAME = 'listopic-cache-v2'; // Incrementamos la versión para forzar la actualización
const urlsToCacheOnInstall = [
  '/',
  'index.html',
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

  // LA LÍNEA MÁGICA: Ignora todo lo que no sea una petición http o https
  if (!request.url.startsWith('http')) {
    return;
  }

  // No interceptamos peticiones que no sean GET
  if (request.method !== 'GET') {
    return;
  }
  
  // No cacheamos las peticiones a las APIs de Firebase ni de Algolia.
  // Dejamos que vayan directas a la red, pero si fallan, fallarán.
  // El error que veías era porque la red misma no resolvía el nombre.
  if (request.url.includes('firestore.googleapis.com') || request.url.includes('identitytoolkit.googleapis.com') || request.url.includes('.algolia.net')) {
    return;
  }
  
  // Estrategia: Stale-While-Revalidate (primero caché, luego red)
  // para todos los demás assets (CSS, JS, imágenes).
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request).then((networkResponse) => {
          // Si la petición a la red es exitosa, la guardamos en caché para la próxima vez
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        });

        // Devolvemos la respuesta de la caché inmediatamente si existe,
        // mientras la petición de red se actualiza en segundo plano.
        return cachedResponse || fetchPromise;
      });
    })
  );
});