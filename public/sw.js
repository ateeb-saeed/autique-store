// Service worker for the installable "autique." app.
// - Pages: network first, so customers always get the live store; the cached
//   home page is only used when there is no connection.
// - Styles, scripts, icons, product photos: served from cache and refreshed in
//   the background (they are versioned with ?v=, so updates still arrive).
// - Never cached: the API, webhooks, admin and logistics portals.

const CACHE = 'autique-app-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/car-mark.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const NEVER_CACHE = [/^\/api\//, /^\/webhooks\//, /^\/admin/, /^\/logistics/, /^\/sw\.js$/, /^\/portal-/, /^\/manifest-/];

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some(re => re.test(url.pathname))) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok && url.pathname === '/') caches.open(CACHE).then(c => c.put('/', res.clone()));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req);
      const fresh = fetch(req).then(res => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
