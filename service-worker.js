/* Parole Salariés By Cedmad — Service worker (PWA offline shell) */
const CACHE = 'parole-salaries-v3';
const ASSETS = [
  'index.html', 'elus.html',
  'css/styles.css', 'css/portal.css', 'css/elus.css',
  'js/ui.js', 'js/store.js', 'js/assistant.js', 'js/export.js',
  'js/salarie.js', 'js/elus.js', 'js/config.js', 'js/api.js', 'js/data.js',
  'js/vendor/qrcode.min.js', 'js/vendor/supabase.min.js',
  'assets/logo.png', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/apple-touch-icon.png',
  'manifest.webmanifest', 'elus.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Cache-first pour la coque de l'app ; réseau sinon
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).catch(() => cached))
  );
});
