/* Service worker del programa del FICX.
   El documento va PRIMERO a la red: es donde está el programa y los enlaces compartidos, y
   servir una copia vieja mostraría pases caducados. El caché solo entra cuando no hay red.

   La página se guarda bajo una única URL canónica (la raíz del ámbito) para que da igual si se
   entra por «/», por «/index.html» o con un fragmento «#pases=…»: el fragmento nunca llega al
   service worker, y de las dos rutas solo se conserva esta copia. */

const CACHE_PREFIX = `ficx64:${self.registration.scope}:`;
const VERSION = `${CACHE_PREFIX}__BUILD_VERSION__`;
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
    caches.open(VERSION).then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" }))))
  );
});

// La actualización solo toma el control cuando la persona pulsa Actualizar.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION && (key.startsWith(CACHE_PREFIX) || /^ficx64-v\d+$/.test(key))).map((key) => caches.delete(key))))
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
    // Red primero; si falla, la copia canónica. `caches.open(VERSION).then((cache) => cache.match(HOME))` no depende de la ruta pedida.
    event.respondWith(
      fetch(new Request(request, { cache: "no-cache" }))
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(VERSION).then((cache) => cache.put(HOME, copy)).catch(() => {}));
          }
          return response;
        })
        .catch(() => caches.open(VERSION).then((cache) => cache.match(HOME)))
    );
    return;
  }

  // Iconos y manifest: caché primero, se descargan una vez.
  event.respondWith(
    caches.open(VERSION).then((cache) => cache.match(request)).then((cached) => cached || fetch(request).then((response) => {
      const copy = response.clone();
      if (response.ok) event.waitUntil(caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {}));
      return response;
    }))
  );
});
