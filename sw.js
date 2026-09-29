// Shoot & Edit Board: always loads the newest page when online, falls back to the saved copy when offline,
// and handles Windows notification clicks.
const CACHE = 'prime-board-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => {
  // cache: 'reload' skips the browser's own cache, so a new version is really fetched fresh
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => fetch(u, { cache: 'reload' }).then(r => r.ok && c.put(u, r)).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.indexOf('prime-board') === 0 && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                              // data calls go straight to your Google Sheet
  const url = new URL(req.url);
  const same = url.origin === location.origin;
  const fontsOrLibs = /fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/.test(url.host);
  if (!same && !fontsOrLibs) return;
  // the page itself: newest version first, saved copy only when offline or very slow
  if (req.mode === 'navigate' || (same && /\/(index\.html)?$/.test(url.pathname))) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const net = await Promise.race([
          fetch(req, { cache: 'no-store' }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))
        ]);
        if (net && net.ok) { c.put('./index.html', net.clone()); return net; }
        throw new Error('bad');
      } catch (err) {
        return (await c.match('./index.html')) || (await c.match('./')) || fetch(req);
      }
    })());
    return;
  }
  // icons, fonts, libraries: saved copy first, refreshed in the background
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: same });
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
// clicking a Windows notification (or its button) brings the app to the front and passes the action on
self.addEventListener('notificationclick', e => {
  const n = e.notification; n.close();
  const msg = Object.assign({ action: e.action || 'open' }, n.data || {});
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list[0];
    if (c) { c.postMessage(msg); return c.focus(); }
    return self.clients.openWindow('./');
  }));
});
