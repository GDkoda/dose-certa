import { afterEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./pwa";

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("registerServiceWorker", () => {
  it("does not register when PWA support is disabled", async () => {
    const register = vi.fn();
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });

    await registerServiceWorker(false);

    expect(register).not.toHaveBeenCalled();
  });

  it("registers the worker at the app root when supported", async () => {
    const register = vi.fn().mockResolvedValue({ scope: "/" });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });

    await registerServiceWorker(true);

    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("keeps the app running if worker registration fails", async () => {
    const register = vi.fn().mockRejectedValue(new Error("permission denied"));
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(registerServiceWorker(true)).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalledOnce();
  });
});
