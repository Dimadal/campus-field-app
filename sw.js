// Campus — service worker для push-уведомлений
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'Campus', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Campus', {
    body: d.body || '',
    icon: 'icon-192.png',
    tag: d.tag || 'campus',
    renotify: true,
    vibrate: [250, 120, 250, 120, 250],
    data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if (c.url.startsWith(self.location.origin) && 'focus' in c) return c.focus();
    }
    return clients.openWindow(url);
  }));
});
