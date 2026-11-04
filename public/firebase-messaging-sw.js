importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

const config = Object.fromEntries(new URL(self.location).searchParams);
firebase.initializeApp(config);
const messaging = firebase.messaging();

// 20 ciclos: 400 ms vibrando + 100 ms de pausa (aprox. 10 segundos).
// O Android/navegador pode ignorar ou limitar esse padrão em notificações.
const backgroundVibrationPattern = Array.from({ length: 20 }, () => [400, 100]).flat();

// Persistent, high-priority medication alarm with action buttons.
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  const title = d.title || payload.notification?.title || "Hora do medicamento";
  return self.registration.showNotification(title, {
    body: d.body || "Abra o Dose Certa para registrar a dose.",
    icon: "/icon-512.png",
    badge: "/icon-192.png",
    tag: d.tag || "dose-certa",
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: backgroundVibrationPattern,
    actions: d.doseIds ? [
      { action: "taken", title: "Já tomei" },
      { action: "snooze", title: "Lembrar em 5 min" },
    ] : [],
    data: { url: d.url || "/", owner: d.owner, doseIds: d.doseIds, sig: d.sig },
  });
});

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
        await self.registration.showNotification(event.action === "taken" ? "Dose registrada ✓" : "Lembraremos em 5 minutos", { tag: "dose-certa-ack", icon: "/icon-192.png", silent: true });
      } catch {
        await openApp(data.url);
      }
    })());
    return;
  }
  event.waitUntil(openApp(data.url));
});
