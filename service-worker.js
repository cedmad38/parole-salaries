/* Parole Salariés By Cedmad — Service worker (PWA offline shell) */
const CACHE = 'parole-salaries-v6';
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

// RÉSEAU D'ABORD : on récupère toujours la dernière version en ligne, et on
// met le cache à jour au passage. Repli sur le cache uniquement hors ligne.
// { cache: 'no-store' } force le navigateur à ignorer SON PROPRE cache HTTP
// (max-age envoyé par GitHub Pages) — sans ça, cette étape « réseau d'abord »
// pouvait quand même renvoyer une réponse plusieurs minutes périmée, d'où le
// problème récurrent « je ne vois pas la mise à jour » après un déploiement.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-store' }).then((resp) => {
      const copy = resp.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return resp;
    }).catch(() => caches.match(e.request))
  );
});
