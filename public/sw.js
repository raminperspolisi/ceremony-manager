const CACHE_NAME = 'ceremony-manager-shell-v3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon.ico',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
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
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
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

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreVary: true });
    if (url.pathname.startsWith('/assets/')) {
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      } catch {
        if (cached) return cached;
        throw new Error('آفلاین هستید و این فایل هنوز ذخیره نشده است.');
      }
    }
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  })());
});
