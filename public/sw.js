// RetailX service worker: shows push notifications and opens the right page when one is tapped.
self.addEventListener("push", (event) => {
  let data = { title: "RetailX", body: "", url: "/dashboard" };
  try { data = { ...data, ...event.data.json() }; } catch { /* plain text or empty */ }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: "/icon.svg", badge: "/icon.svg", data: { url: data.url } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/dashboard";
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = tabs.find((t) => new URL(t.url).origin === self.location.origin);
    if (open) { await open.focus(); return open.navigate(url); }
    return self.clients.openWindow(url);
  })());
});

// Offline counter: the last good /pos page (with the stock list it was built from) and the app's static files are
// kept, so a shop whose internet drops can reload the counter and keep billing; bills queue on the device (Counter.tsx).
// Cleared at sign-out so a shared computer doesn't keep the previous person's stock list.
const POS = "rx-pos-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (req.mode === "navigate" && url.pathname === "/pos") {
    e.respondWith(fetch(req).then((r) => {
      if (r.ok && !r.redirected) { const copy = r.clone(); e.waitUntil(caches.open(POS).then((c) => c.put("/pos", copy))); }
      return r;
    }).catch(async () => (await caches.match("/pos")) ?? Response.error()));
  } else if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(caches.open(POS).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    }));
  }
});
