// Service Worker — оболочка офлайн, обновления подхватываются сразу
const CACHE = 'planner-v3';
const SHELL = ['./', './index.html', './styles.css', './app.js', './config.js', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// Клик по уведомлению — открыть приложение (или сфокусировать уже открытое)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) return c.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow('./');
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.hostname.includes('supabase.co')) return;
  if (e.request.method !== 'GET') return;

  // Network-first для оболочки: всегда стараемся достать свежую версию,
  // кэш — только как резерв на офлайн.
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
