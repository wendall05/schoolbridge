const CACHE_NAME = 'schoolbridge-v7';

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' })))
  );
});

// ── Fetch: only intercept same-origin requests ────────────────────────────────
// CDN assets (Tailwind, fonts) are left entirely to the browser — no SW interference
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // Let the browser handle all cross-origin requests (CDN, fonts, etc.)
  if (url.origin !== self.location.origin) return;

  // API feed: network-first, cache for offline fallback
  if (url.pathname === '/api/feed') {
    event.respondWith(networkFirstCacheFeed(request));
    return;
  }

  // All other same-origin requests: network-first, no caching
  event.respondWith(
    fetch(request).catch(() => caches.match('/index.html'))
  );
});

async function networkFirstCacheFeed(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-Served-From-Cache', 'true');
      const body = await cached.blob();
      return new Response(body, { status: 200, headers });
    }
    return new Response(JSON.stringify({ error: 'offline', offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
