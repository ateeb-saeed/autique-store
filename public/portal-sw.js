// Service worker for the "autique admin" and "autique logistics" apps.
// Served at /admin/sw.js and /logistics/sw.js so each app gets its own scope.
// Nothing is cached: these pages show live orders, stock and customer details.
// Without a connection, pages get a short "you're offline" message instead of
// the browser's error screen.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

const OFFLINE_PAGE = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#fff;color:#0f1b2b;padding:20px;box-sizing:border-box;text-align:center}
.box{max-width:360px;border:1.5px solid #0f1b2b;border-radius:22px;padding:30px}h1{font-size:1.3rem;margin:0 0 8px}p{color:#4b586b;margin:0 0 18px}
button{border:1.5px solid #0f1b2b;background:#0f1b2b;color:#fff;border-radius:999px;padding:11px 22px;font:inherit;font-weight:600;cursor:pointer}</style></head>
<body><div class="box"><h1>You're offline</h1><p>This app needs a connection to show live orders and stock.</p><button onclick="location.reload()">Try again</button></div></body></html>`;

self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() => new Response(OFFLINE_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
  );
});
