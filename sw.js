const CACHE_NAME = 'agrogest-pwa-v3'; // <--- VERSIÓN ACTUALIZADA (V3)
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json'
];

// Instala la nueva versión
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting(); // Fuerza a que esta versión tome el control
});

// Borra la memoria caché antigua
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Estrategia "Network First" (Primero Red, luego Caché) para TODO
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request)
            .then(networkResponse => {
                // Si hay internet, actualiza la caché con la nueva versión
                return caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            })
            .catch(() => {
                // Si no hay internet (fundo/campo), usa la memoria guardada
                return caches.match(event.request);
            })
    );
});