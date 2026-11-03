// Server-only helpers for medication push delivery. Secrets are read inside functions.
const GATEWAY = "https://connector-gateway.lovable.dev/firebase_messaging/v1/projects/_/messages:send";

async function hmac(text: string) {
  const secret = process.env["LOVABLE_API_KEY"];
  if (!secret) throw new Error("LOVABLE_API_KEY missing");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`dose-action:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Signs dose ids so the notification buttons can act without a session. */
export async function signDoseAction(owner: string, doseIds: string[]) {
  return hmac(`${owner}|${doseIds.join(",")}`);
}

export async function verifyDoseAction(owner: string, doseIds: string[], sig: string) {
  const expected = await hmac(`${owner}|${doseIds.join(",")}`);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export type PushPayload = { title: string; body: string; tag: string; url: string; owner: string; doseIds: string[]; sig: string; test?: boolean };

/** Data-only message so the service worker shows a persistent notification with action buttons. */
export async function sendPush(token: string, p: PushPayload) {
  const key = process.env["LOVABLE_API_KEY"];
  const connection = process.env["FIREBASE_MESSAGING_API_KEY"];
  if (!key || !connection) return { ok: false, status: 503, body: "not configured" };
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "X-Connection-Api-Key": connection, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { token, data: { title: p.title, body: p.body, tag: p.tag, url: p.url, owner: p.owner, doseIds: p.doseIds.join(","), sig: p.sig, test: p.test ? "1" : "0" }, android: { priority: "HIGH" }, webpush: { headers: { TTL: "600", Urgency: "high" } } } }),
  });
  return { ok: res.ok, status: res.status, body: res.ok ? "" : await res.text() };
}
