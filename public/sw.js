// Service Worker for InboxWeave PWA.
// Handles: offline indicator, push notifications, caching shell.

const CACHE_NAME = "ai-inbox-v1";
const SHELL_URLS = ["/", "/login", "/home"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first with cache fallback for navigation.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then((r) => r || caches.match("/")))
  );
});

// Push notification handler.
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "InboxWeave";
  const options = {
    body: data.body || "You have a new message",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/home" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click: focus or open the app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/home";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
