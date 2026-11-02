/* Service worker del programa del FICX.
   El documento va PRIMERO a la red: es donde está el programa y los enlaces compartidos, y
   servir una copia vieja mostraría pases caducados. El caché solo entra cuando no hay red.

   La página se guarda bajo una única URL canónica (la raíz del ámbito) para que da igual si se
   entra por «/», por «/index.html» o con un fragmento «#pases=…»: el fragmento nunca llega al
   service worker, y de las dos rutas solo se conserva esta copia. */

const VERSION = "ficx64-v2";
const HOME = new URL("./", self.location).href;
const SHELL = [
  // Solo la canónica: guardar también index.html dejaría dos copias de la misma página.
  "./",
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
    // Red primero; si falla, la copia canónica. `caches.match(HOME)` no depende de la ruta pedida.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(HOME, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(HOME))
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
