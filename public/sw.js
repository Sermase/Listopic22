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

// URLs de Cloud Functions que no se deben cachear
const cloudFunctionsUrls = [
  'https://europe-west1-listopic.cloudfunctions.net/',
];

// Interceptación de peticiones de fetch
self.addEventListener('fetch', (e) => {
    // Excluir explícitamente las peticiones a las Cloud Functions
    if (cloudFunctionsUrls.some(url => e.request.url.startsWith(url))) {
        return; // No hacemos nada, la petición irá directamente a la red.
    }

    // Estrategia de caché: Cache-first para recursos estáticos
    e.respondWith(
        caches.match(e.request).then((response) => {
            if (response) {
                return response;
            }

            // Clona la petición para poder usarla en la caché
            const fetchRequest = e.request.clone();

            return fetch(fetchRequest).then((response) => {
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }

                // Clona la respuesta para la caché
                const responseToCache = response.clone();

                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(e.request, responseToCache);
                });

                return response;
            });
        })
    );
});

// Evento de activación para limpiar cachés antiguas
self.addEventListener('activate', (e) => {
    const cacheWhitelist = [CACHE_NAME];
    e.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});