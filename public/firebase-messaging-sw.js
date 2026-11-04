importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

const config = Object.fromEntries(new URL(self.location).searchParams);
firebase.initializeApp(config);
const messaging = firebase.messaging();

// Experimental background alert burst for mobile notification channels.
// Android 8+ Chrome ignores NotificationOptions.vibrate. To test whether the
// system notification channel can re-alert with its own sound/vibration, we
// replace the SAME tagged notification 20 times, 500 ms apart.
// This keeps one notification card and stops as soon as the user dismisses it.
const BACKGROUND_ALERT_COUNT = 20;
const BACKGROUND_ALERT_INTERVAL_MS = 500;
const BACKGROUND_VIBRATION_PULSE = [400, 100];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function showBackgroundAlarm(title, options) {
  await self.registration.showNotification(title, options);

  for (let pulse = 1; pulse < BACKGROUND_ALERT_COUNT; pulse += 1) {
    await wait(BACKGROUND_ALERT_INTERVAL_MS);

    // If the user tapped/dismissed the alarm, do not reopen it.
    const visible = await self.registration.getNotifications({ tag: options.tag });
    if (!visible.length) break;

    await self.registration.showNotification(title, {
      ...options,
      // Repeated single pulses are more likely to respect per-notification limits.
      vibrate: BACKGROUND_VIBRATION_PULSE,
      timestamp: Date.now(),
    });
  }
}

// Persistent, high-priority medication alarm with action buttons.
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
