/* Mi aventura · funciona sin conexión
 *
 * Convive con otras apps en el mismo dominio (tuusuario.github.io/<app>/):
 * la caché del navegador es compartida por todo el dominio, así que este
 * service worker solo crea, lee y borra cachés que empiezan por PREFIX.
 * Para publicar una versión nueva basta con subir el número de VERSION.
 */
importScripts('recordatorio.js');
const R = self.MiAventuraRecordatorio;

const PREFIX = 'mi-aventura-';
const VERSION = PREFIX + 'v3';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'importer.js',
  'recordatorio.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/badge-96.png',
];

/* ---------- recordatorio tras varios días sin apuntar nada ---------- */
async function remind(test) {
  const idle = test ? 0 : R.due(await R.load());
  if (!test && !idle) return;
  await self.registration.showNotification('Mi aventura', {
    body: test ? `Prueba: así te avisaré cuando pasen ${R.DAYS} días sin apuntar nada.` : R.text(idle),
    tag: R.TAG,
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    data: { nuevo: true },
    actions: [{ action: 'nuevo', title: 'Apuntar ahora' }],
  });
  if (!test) await R.update({ lastNotified: Date.now() });
}

// Chrome (Android, app instalada) despierta al service worker un par de veces al día
self.addEventListener('periodicsync', (event) => {
  if (event.tag === R.TAG) event.waitUntil(remind(false));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'mi-aventura:probar') event.waitUntil(remind(true));
});

// Al tocar el aviso: abre Mi aventura (nunca otra app del mismo dominio) con el editor de hoy
self.addEventListener('notificationclick', (event) => {
  if (event.notification.tag !== R.TAG) return;
  event.notification.close();
  event.waitUntil((async () => {
    const scope = self.registration.scope;
    const wins = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .filter((c) => c.url.startsWith(scope));
    if (wins.length) {
      await wins[0].focus();
      wins[0].postMessage({ type: 'mi-aventura:nuevo' });
    } else {
      await self.clients.openWindow(scope + '#nuevo');
    }
  })());
});

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
