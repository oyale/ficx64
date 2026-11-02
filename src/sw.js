/* Service worker del programa del FICX.
   El documento va PRIMERO a la red: es donde está el programa y los enlaces compartidos, y
   servir una copia vieja mostraría pases caducados. El caché solo entra cuando no hay red. */

const VERSION = "ficx64-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // imágenes de ficx.tv: nunca se tocan

  const isDocument = request.mode === "navigate" || request.destination === "document";
  if (isDocument) {
    // Red primero; si falla, la copia guardada.
    const base = new URL("./", self.location).href;
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(base, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(base).then((cached) => cached || caches.match(request)))
    );
    return;
  }

  // Iconos y manifest: caché primero, se descargan una vez.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
      return response;
    }))
  );
});
