const CACHE = 'eemsa-v2';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(['/', '/logo192.png', '/favicon.ico']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const { request: req } = e;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Ignorar: supabase, api routes, extensiones
  if (url.hostname !== self.location.hostname || url.pathname.startsWith('/api/')) return;

  // Activos estáticos con hash (JS, CSS, imágenes): cache-first
  if (url.pathname.match(/\.(js|css|png|ico|woff2?|svg)$/)) {
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
        return res;
      }))
    );
    return;
  }

  // Navegación HTML: network-first, fallback a cache o raíz
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
        return res;
      })
      .catch(() => caches.match(req).then(cached => cached || caches.match('/')))
  );
});

self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'EEMSA System', {
      body: data.body || '',
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: 'eemsa',
      renotify: true,
      data: { url: data.url || '/' },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      const target = e.notification.data?.url || '/';
      const open = wins.find(w => w.url.includes(self.location.origin));
      if (open) { open.focus(); return open.navigate(target); }
      return clients.openWindow(target);
    })
  );
});
