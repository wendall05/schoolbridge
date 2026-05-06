/**
 * SchoolBridge Service Worker — PWA offline support
 * Strategy: cache-first for static assets, network-first for API calls
 * Offline fallback: serves cached feed data when network unavailable
 */

const CACHE_NAME = 'schoolbridge-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  'https://cdn.tailwindcss.com/3.4.17',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
];

// ── Install: cache static assets ─────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing strategy ───────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin non-CDN requests
  if (request.method !== 'GET') return;

  // API routes: network-first, cache fallback for /api/feed
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithFeedFallback(request));
    return;
  }

  // Auth routes: always network
  if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/lti/')) return;

  // Static assets: cache-first
  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirstWithFeedFallback(request) {
  const url = new URL(request.url);
  try {
    const response = await fetch(request);
    // Cache successful feed responses for offline use
    if (response.ok && url.pathname === '/api/feed') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline: return cached feed if available
    const cached = await caches.match(request);
    if (cached) {
      // Add offline header so app can show stale data banner
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

// ── Background sync: queue justification submissions when offline ──────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-justifications') {
    event.waitUntil(flushOfflineQueue());
  }
});

async function flushOfflineQueue() {
  const cache = await caches.open(CACHE_NAME);
  const queueStr = await cache.match('/__offline-queue__');
  if (!queueStr) return;

  const queue = await queueStr.json();
  const remaining = [];

  for (const item of queue) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.body),
      });
      if (!res.ok) remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }

  if (remaining.length) {
    await cache.put('/__offline-queue__', new Response(JSON.stringify(remaining)));
  } else {
    await cache.delete('/__offline-queue__');
  }
}
