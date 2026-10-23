/* RG&SA PLANTÃO — Service Worker (PWA real, sem dependências) */
const VERSION = 'rgsa-plantao-v2.0.0';
const SHELL_CACHE = `${VERSION}-shell`;
const STATIC_CACHE = `${VERSION}-static`;
const DATA_CACHE = `${VERSION}-data`;

const SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/favicon-32.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)));
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.disable();
        } catch {
          /* ignore */
        }
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

function isCacheableApi(url) {
  return (
    url.pathname === '/api/bootstrap' ||
    url.pathname === '/api/calendar' ||
    url.pathname === '/api/reports/monthly' ||
    url.pathname === '/api/integrations/weather' ||
    url.pathname === '/api/auth/me'
  );
}

function isStaticAsset(url) {
  return /\.(?:js|css|woff2?|png|svg|webp|ico)$/i.test(url.pathname) || url.pathname.startsWith('/assets/');
}

async function networkFirst(request, cacheName, fallbackToShell = false) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: false });
    if (cached) return cached;
    if (fallbackToShell) {
      const shell = (await caches.match('/index.html')) || (await caches.match('/'));
      if (shell) return shell;
      const offline = await caches.match('/offline.html');
      if (offline) return offline;
    }
    throw error;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE, true));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    if (isCacheableApi(url)) {
      event.respondWith(
        networkFirst(request, DATA_CACHE).catch(async () => {
          const cached = await caches.match(request);
          if (cached) {
            const headers = new Headers(cached.headers);
            headers.set('x-rgsa-offline', '1');
            return new Response(cached.body, { status: 200, headers });
          }
          return new Response(
            JSON.stringify({ error: { code: 'offline', message: 'Sem conexão. Exibindo dados salvos no aparelho.' } }),
            { status: 503, headers: { 'content-type': 'application/json' } },
          );
        }),
      );
    }
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/?tab=escala';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(target);
            } catch {
              /* ignore */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});
