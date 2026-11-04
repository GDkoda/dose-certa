export type PushResult = { status: "registered"; token: string } | { status: "not-configured" | "unsupported" | "open-in-new-tab" | "denied" };

function messagingConfig() {
  const appId = import.meta.env['VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_APP_ID'];
  return {
    apiKey: import.meta.env['VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_WEB_API_KEY'],
    projectId: import.meta.env['VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_PROJECT_ID'],
    appId,
    messagingSenderId: appId?.split(":")[1] ?? "",
  };
}

/**
 * Registers the shared service worker for offline shell caching even when
 * notification permission has not been requested. Firebase messaging is
 * initialized inside the worker only when a valid config is present.
 */
export async function registerAppServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  const config = messagingConfig();
  const hasFirebaseConfig = Boolean(config.apiKey && config.projectId && config.appId && config.messagingSenderId);
  const scriptUrl = hasFirebaseConfig
    ? `/firebase-messaging-sw.js?${new URLSearchParams(config).toString()}`
    : "/firebase-messaging-sw.js";
  return navigator.serviceWorker.register(scriptUrl);
}

export async function enablePush(): Promise<PushResult> {
  const appId = import.meta.env['VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_APP_ID'];
  const vapidKey = import.meta.env['VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_VAPID_KEY'];
  const config = messagingConfig();
  if (!config.apiKey || !config.projectId || !appId || !vapidKey || !config.messagingSenderId) return { status: "not-configured" };
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return { status: "unsupported" };
  if (window.top !== window.self) return { status: "open-in-new-tab" };
  if (Notification.permission === "denied") return { status: "denied" };
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return { status: "denied" };

  const [{ initializeApp, getApps }, { getMessaging, getToken, isSupported }] = await Promise.all([
    import("firebase/app"),
    import("firebase/messaging"),
  ]);
  if (!(await isSupported())) return { status: "unsupported" };

  const registration = await registerAppServiceWorker();
  if (!registration) return { status: "unsupported" };
  const app = getApps().find((item) => item.name === "dose-certa-push") ?? initializeApp(config, "dose-certa-push");
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration });
  return token ? { status: "registered", token } : { status: "denied" };
}
