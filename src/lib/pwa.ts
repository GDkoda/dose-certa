/** Registers the PWA worker only in production and only where supported. */
export async function registerServiceWorker(
  enabled = import.meta.env.PROD,
): Promise<void> {
  if (!enabled || typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (error) {
    // The app remains usable if offline capabilities cannot be enabled.
    console.warn("Dose Certa: não foi possível registrar o modo offline.", error);
  }
}
