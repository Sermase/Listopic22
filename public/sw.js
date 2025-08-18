/* ========================================= */
/* ===       Service Worker para Listopic   === */
/* ========================================= */

// Nombre de la caché para los datos de la API y las imágenes
const CACHE_NAME = 'listopic-data-cache-v1';

// URLS que queremos cachear al instalar el Service Worker
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/js/main.js'
  // Aquí podrías agregar otras URLs estáticas importantes
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((cacheName) => {
          // Elimina las cachés viejas para evitar conflictos
          return cacheName.startsWith('listopic-') && cacheName !== CACHE_NAME;
        }).map((cacheName) => {
          return caches.delete(cacheName);
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Estrategia Stale-While-Revalidate para las peticiones a la API
  if (event.request.url.includes('/api/')) { // Asumiendo que las peticiones a la API contienen /api/
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          const fetchPromise = fetch(event.request).then((networkResponse) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
          // Devolver la respuesta cacheada si existe, mientras se actualiza en segundo plano
          return cachedResponse || fetchPromise;
        });
      })
    );
  } else {
    // Para otras peticiones (recursos estáticos), usamos la estrategia Cache First
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});
