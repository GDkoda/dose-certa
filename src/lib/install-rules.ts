/**
 * Decides whether the app should ask the visitor to add Dose Certa to their
 * home screen / desktop, and which instructions fit the current browser.
 *
 * Pure rules only: the browser glue lives in install-prompt.ts.
 */

/** After a decline (or an install) the request comes back after three days. */
export const REINSTALL_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

export type InstallStep = "none" | "native" | "ios" | "desktop" | "own-tab";

export type InstallEnv = {
  /** Already running as an installed app (home screen / desktop shortcut). */
  standalone: boolean;
  /** The browser handed us an install request we are allowed to show. */
  canPrompt: boolean;
  isIos: boolean;
  /** Opened inside another page's frame, where browsers refuse to install. */
  inFrame: boolean;
  /** When this device last declined (or installed) the app, in ms. */
  dismissedAt: number | null;
  now: number;
};

export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  const touchMac = /Macintosh/.test(userAgent) && maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(userAgent) || touchMac;
}

export function installStep(env: InstallEnv): InstallStep {
  if (env.standalone) return "none";
  if (env.dismissedAt !== null && env.now - env.dismissedAt < REINSTALL_AFTER_MS) return "none";
  if (env.inFrame) return "own-tab";
  if (env.canPrompt) return "native";
  if (env.isIos) return "ios";
  return "desktop";
}

/** Only an explicit "accepted" counts; anything else stops the nagging. */
export function installOutcome(outcome: string | undefined): "accepted" | "dismissed" {
  return outcome === "accepted" ? "accepted" : "dismissed";
}
