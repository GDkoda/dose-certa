import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
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

describe("PWA static assets", () => {
  const publicDir = resolve(process.cwd(), "public");

  it("declares a standalone Portuguese app with valid icon paths", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(publicDir, "manifest.webmanifest"), "utf8"),
    ) as { name: string; lang: string; display: string; icons: { src: string }[] };

    expect(manifest.name).toBe("Dose Certa");
    expect(manifest.lang).toBe("pt-BR");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    for (const icon of manifest.icons) {
      expect(existsSync(resolve(publicDir, icon.src.replace(/^\//, "")))).toBe(true);
    }
  });

  it("keeps navigation and personal/API data out of the cache", () => {
    const worker = readFileSync(resolve(publicDir, "sw.js"), "utf8");

    expect(worker).toContain('if (request.mode === "navigate")');
    expect(worker).toContain('if (url.origin !== self.location.origin) return;');
    expect(worker).toContain('url.pathname.startsWith("/assets/")');
    expect(worker).not.toContain("cache.put(request, response)");
  });

  it("provides a Portuguese offline fallback page", () => {
    const offline = readFileSync(resolve(publicDir, "offline.html"), "utf8");

    expect(offline).toContain('<html lang="pt-BR">');
    expect(offline).toContain("Você está sem conexão");
    expect(offline).toContain("Tentar novamente");
  });
});
