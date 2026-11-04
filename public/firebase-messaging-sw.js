const config = Object.fromEntries(new URL(self.location).searchParams);
const hasFirebaseConfig = Boolean(config.apiKey && config.projectId && config.appId && config.messagingSenderId);
let messaging = null;

if (hasFirebaseConfig) {
  importScripts("https://www.gstatic.com/firebasejs/13.1.0/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/13.1.0/firebase-messaging-compat.js");
  firebase.initializeApp(config);
  messaging = firebase.messaging();

  // One persistent notification per delivery. The operating system controls
  // vibration and sound; repeatedly re-presenting the same notification can
  // race with the user's action and create additional alerts.
  const BACKGROUND_VIBRATION_PULSE = [400, 100];

  async function showBackgroundAlarm(title, options) {
    await self.registration.showNotification(title, options);
  }

  messaging.onBackgroundMessage((payload) => {
    const d = payload.data || {};
    const title = d.title || payload.notification?.title || "Hora do medicamento";
    const tag = d.tag || "dose-certa";
    return showBackgroundAlarm(title, {
      body: d.body || "Abra o Dose Certa para registrar a dose.",
      icon: "/icon-512.png",
      badge: "/icon-192.png",
      tag,
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: BACKGROUND_VIBRATION_PULSE,
      actions: d.doseIds ? [
        { action: "taken", title: "Já tomei" },
        { action: "snooze", title: "Lembrar em 5 min" },
      ] : [],
      data: { url: d.url || "/", tag, owner: d.owner, doseIds: d.doseIds, sig: d.sig },
    });
  });
}

async function openApp(url) {
  const target = new URL(url || "/", self.location.origin).href;
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of list) {
    if (c.url.startsWith(self.location.origin) && "focus" in c) { await c.focus(); return; }
  }
  if (self.clients.openWindow) await self.clients.openWindow(target);
}

self.addEventListener("notificationclick", (event) => {
  const n = event.notification;
  const data = n.data || {};
  n.close();
  if ((event.action === "taken" || event.action === "snooze") && data.doseIds) {
    event.waitUntil((async () => {
      try {
        const res = await fetch("/api/public/dose-action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner: data.owner, doseIds: String(data.doseIds).split(","), sig: data.sig, action: event.action }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const activeNotifications = await self.registration.getNotifications({ tag: data.tag });
        for (const notification of activeNotifications) notification.close();

        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const client of windows) {
          client.postMessage({
            type: "DOSE_ACTION_COMPLETED",
            owner: data.owner,
            doseIds: String(data.doseIds).split(","),
            action: event.action,
          });
        }
        await self.registration.showNotification(event.action === "taken" ? "Dose registrada ✓" : "Lembraremos em 5 minutos", { tag: "dose-certa-ack", icon: "/icon-192.png", silent: true });
      } catch {
        await openApp(data.url);
      }
    })());
    return;
  }
  event.waitUntil(openApp(data.url));
});


// ---- Offline application shell ----
// Cache only same-origin app navigation and static assets. API requests,
// auth endpoints and Supabase data are deliberately never cached here.
const OFFLINE_CACHE_PREFIX = "dose-certa-shell-";
const OFFLINE_CACHE_NAME = OFFLINE_CACHE_PREFIX + "v1";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(OFFLINE_CACHE_NAME);
    try {
      await cache.add(new Request("/", { cache: "reload" }));
    } catch (error) {
      // The service worker may install in a constrained preview. Runtime
      // caching can still fill the shell cache on the next successful visit.
      console.warn("Dose Certa offline shell precache skipped", error);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(OFFLINE_CACHE_PREFIX) && name !== OFFLINE_CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

function isCacheableAppRequest(request, url) {
  if (request.method !== "GET" || url.origin !== self.location.origin) return false;
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_serverFn") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/rest/") ||
    url.pathname.startsWith("/storage/") ||
    url.pathname.startsWith("/firebase-messaging-sw.js") ||
    url.pathname.includes("supabase")
  ) return false;
  return true;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (!isCacheableAppRequest(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(OFFLINE_CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response && response.ok && response.type !== "opaque") {
          await cache.put(request, response.clone()).catch(() => undefined);
          // The root route is the offline entry point for the single-shell app.
          if (url.pathname === "/") await cache.put("/", response.clone()).catch(() => undefined);
        }
        return response;
      } catch {
        return (await cache.match(request))
          || (await cache.match("/"))
          || new Response(
            "O Dose Certa ainda não foi carregado neste aparelho. Conecte-se à internet e abra o aplicativo uma vez para preparar o acesso offline.",
            { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
          );
      }
    })());
    return;
  }

  const isStaticAsset = ["script", "style", "image", "font", "worker"].includes(request.destination)
    || url.pathname.startsWith("/assets/")
    || /\\.(?:js|css|png|jpe?g|webp|svg|woff2?|ttf|ico)$/i.test(url.pathname);
  if (!isStaticAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(OFFLINE_CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) {
      // Refresh cache in the background while serving a known-good resource.
      void fetch(request).then((response) => {
        if (response && response.ok && response.type !== "opaque") return cache.put(request, response);
        return undefined;
      }).catch(() => undefined);
      return cached;
    }
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type !== "opaque") {
        await cache.put(request, response.clone()).catch(() => undefined);
      }
      return response;
    } catch {
      return new Response("", { status: 504, statusText: "Offline resource unavailable" });
    }
  })());
});
