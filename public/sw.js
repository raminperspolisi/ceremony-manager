const CACHE_NAME = 'ceremony-manager-shell-v2';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/azho-app-icon-32.png',
  '/azho-app-icon-180.png',
  '/azho-app-icon-192.png',
  '/azho-app-icon-512.png',
  '/azho-logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    fetch('/index.html')
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not preload the application shell.');
        const html = await response.text();
        const assetPaths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)]
          .map((match) => match[1]);
        const cache = await caches.open(CACHE_NAME);
        await cache.put('/index.html', new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }));
        await cache.addAll([...new Set([...APP_SHELL, ...assetPaths])]);
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(async () => (await caches.match(request, { ignoreVary: true })) || (await caches.match('/index.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreVary: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
