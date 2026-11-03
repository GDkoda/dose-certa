import { useEffect, useState } from "react";
import { installOutcome, installStep, isIosDevice, type InstallStep } from "./install-rules";

const DISMISS_KEY = "dc-install-dismissed";

type DeferredPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome?: string }>;
};

// Kept at module level so the browser's one-shot install request is never lost
// while React is still mounting the app shell.
let deferredPrompt: DeferredPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as DeferredPromptEvent;
    window.dispatchEvent(new Event("dc-install-available"));
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    // Treat a finished install like a decline: the request rests for three days.
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* storage unavailable */ }
    window.dispatchEvent(new Event("dc-install-done"));
  });
}

function readDismissedAt(): number | null {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch { return null; }
}

function isStandalone(): boolean {
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    if (window.matchMedia?.("(display-mode: window-controls-overlay)").matches) return true;
  } catch { /* older browsers */ }
  return (navigator as { standalone?: boolean }).standalone === true;
}

function currentStep(): InstallStep {
  if (typeof window === "undefined") return "none";
  return installStep({
    standalone: isStandalone(),
    canPrompt: deferredPrompt !== null,
    isIos: isIosDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0),
    inFrame: window.top !== window.self,
    dismissedAt: readDismissedAt(),
    now: Date.now(),
  });
}

export function useInstallPrompt() {
  const [step, setStep] = useState<InstallStep>("none");

  useEffect(() => {
    setStep(currentStep());
    const refresh = () => setStep(currentStep());
    window.addEventListener("dc-install-available", refresh);
    window.addEventListener("dc-install-done", refresh);
    return () => {
      window.removeEventListener("dc-install-available", refresh);
      window.removeEventListener("dc-install-done", refresh);
    };
  }, []);

  const rest = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* storage unavailable */ }
    setStep(currentStep());
  };

  const install = async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    const event = deferredPrompt;
    if (!event) return "unavailable";
    try {
      await event.prompt();
      const choice = await event.userChoice;
      deferredPrompt = null;
      const outcome = installOutcome(choice?.outcome);
      if (outcome === "dismissed") rest();
      else setStep(currentStep());
      return outcome;
    } catch {
      deferredPrompt = null;
      setStep(currentStep());
      return "unavailable";
    }
  };

  const openOwnTab = () => {
    try { window.open(window.location.href, "_blank", "noopener,noreferrer"); } catch { /* popup blocked */ }
  };

  return { step, install, rest, openOwnTab };
}
