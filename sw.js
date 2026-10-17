/* Mi aventura · funciona sin conexión
 *
 * Convive con otras apps en el mismo dominio (tuusuario.github.io/<app>/):
 * la caché del navegador es compartida por todo el dominio, así que este
 * service worker solo crea, lee y borra cachés que empiezan por PREFIX.
 * Para publicar una versión nueva basta con subir el número de VERSION.
 */
const PREFIX = 'mi-aventura-';
const VERSION = PREFIX + 'v2';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'importer.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero para la app (así ves siempre la última versión) y caché si no hay conexión.
// Las fuentes de Google se sirven desde caché en cuanto se han descargado una vez.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (isFont) {
    event.respondWith(
      caches.open(VERSION).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
        c.put(req, res.clone());
        return res;
      })))
    );
    return;
  }
  if (url.origin !== location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.open(VERSION).then((c) =>
        c.match(req, { ignoreSearch: true }).then((hit) => hit || c.match('index.html'))
      ))
  );
});
