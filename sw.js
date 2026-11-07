/**
 * Service worker.
 *
 * Chirp is a fully client-side app, so the whole shell can be cached and the
 * messenger keeps working offline (the WebRTC transport obviously still needs
 * a network).
 */

const CACHE_NAME = 'chirp-shell-v2';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icon.svg',
  './vendor/peerjs.min.js',
  './src/styles/tokens.css',
  './src/styles/base.css',
  './src/styles/layout.css',
  './src/styles/components.css',
  './src/core/bus.js',
  './src/core/dom.js',
  './src/core/store.js',
  './src/core/utils.js',
  './src/services/protocol.js',
  './src/services/peer.js',
  './src/services/media.js',
  './src/services/db.js',
  './src/services/notify.js',
  './src/services/crypto.js',
  './src/services/chirp.js',
  './src/services/files.js',
  './src/state/app.js',
  './src/runtime.js',
  './src/main.js',
  './src/ui/icons.js',
  './src/ui/bridge.js',
  './src/ui/shell.js',
  './src/ui/sidebar.js',
  './src/ui/chat.js',
  './src/ui/composer.js',
  './src/ui/call.js',
  './src/ui/settings.js',
  './src/ui/toast.js',
  './src/ui/modal.js',
  './src/ui/popover.js',
  './src/ui/dialogs.js',
  './src/ui/emoji.js',
  './src/ui/emoji-picker.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {
        /* A missing file must not break the install. */
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let fonts & CDNs go to the network

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Refresh in the background.
        fetch(request)
          .then((response) => {
            if (response && response.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
            }
          })
          .catch(() => {});
        return cached;
      }
      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          request.mode === 'navigate'
            ? caches.match('./index.html')
            : new Response('Offline', { status: 503, statusText: 'Offline' }),
        );
    }),
  );
});
