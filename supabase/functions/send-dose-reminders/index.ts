import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Dose = {
  id: string; ownerId: string; patientId: string; medId: string;
  scheduledAt: string; status: string; snoozeUntil?: string; lastShown?: string;
};
type Med = { id: string; ownerId: string; patientId: string; name: string; dose: string; tolerance?: number; archivedAt?: string };
type Patient = { id: string; name: string };
type Device = { owner_id: string; token: string; timezone: string };

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
async function signDoseAction(owner: string, doseIds: string[]): Promise<string> {
  const secret = Deno.env.get("DOSE_ACTION_SIGNING_SECRET") || Deno.env.get("LOVABLE_API_KEY");
  if (!secret) throw new Error("DOSE_ACTION_SIGNING_SECRET is not configured");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`dose-action:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${owner}|${doseIds.join(",")}`),
  ));
  return base64url(signature);
}

async function fetchAllPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loadPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function pemToBytes(pem: string): Uint8Array {
  return Uint8Array.from(atob(pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "")), c => c.charCodeAt(0));
}
async function googleAccessToken(serviceAccount: { client_email: string; private_key: string; token_uri?: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({ iss: serviceAccount.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: serviceAccount.token_uri || "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const unsigned = header + "." + claims;
  const key = await crypto.subtle.importKey("pkcs8", pemToBytes(serviceAccount.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const assertion = unsigned + "." + base64url(signature);
  const response = await fetch(serviceAccount.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error("Google OAuth token request failed");
  const body = await response.json();
  if (typeof body.access_token !== "string") throw new Error("Google OAuth response did not include an access token");
  return body.access_token;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const cronSecret = Deno.env.get("DOSE_REMINDER_CRON_SECRET");
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const serviceAccountRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!supabaseUrl || !serviceRoleKey || !serviceAccountRaw) return json({ error: "Server configuration missing" }, 500);

  let serviceAccount: { project_id: string; client_email: string; private_key: string; token_uri?: string };
  try { serviceAccount = JSON.parse(serviceAccountRaw); } catch { return json({ error: "Invalid Firebase service account secret" }, 500); }
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) return json({ error: "Firebase service account fields missing" }, 500);

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = Date.now();
  const isoNow = new Date(now).toISOString();
  const minDate = new Date(now - 12 * 60 * 60 * 1000).toISOString();
  let doseRows: Record<string, unknown>[];
  let medRows: Record<string, unknown>[];
  let patientRows: Record<string, unknown>[];
  let deviceRows: Record<string, unknown>[];
  try {
    [doseRows, medRows, patientRows, deviceRows] = await Promise.all([
      fetchAllPages((from, to) => supabase.from("app_records").select("id, owner_id, payload").eq("kind", "doses").range(from, to)),
      fetchAllPages((from, to) => supabase.from("app_records").select("id, owner_id, payload").eq("kind", "meds").range(from, to)),
      fetchAllPages((from, to) => supabase.from("app_records").select("id, payload").eq("kind", "patients").range(from, to)),
      fetchAllPages((from, to) => supabase.from("push_devices").select("owner_id, token, timezone").range(from, to)),
    ]);
  } catch {
    return json({ error: "Could not load reminder data" }, 500);
  }

  const meds = new Map<string, Med>();
  for (const row of medRows) {
    const payload = row.payload as Record<string, unknown>;
    meds.set(row.id, { ...payload, id: row.id, ownerId: row.owner_id } as Med);
  }
  const patients = new Map<string, Patient>();
  for (const row of patientRows) {
    const payload = row.payload as Record<string, unknown>;
    patients.set(row.id, { id: row.id, name: String(payload.name ?? "Paciente") });
  }
  const devicesByOwner = new Map<string, Device[]>();
  for (const device of deviceRows as unknown as Device[]) {
    const list = devicesByOwner.get(device.owner_id) ?? [];
    list.push(device); devicesByOwner.set(device.owner_id, list);
  }

  let sent = 0, skipped = 0, failed = 0;
  let accessToken: string | undefined;
  for (const row of doseRows) {
    const dose = { ...(row.payload as Record<string, unknown>), id: row.id, ownerId: row.owner_id } as Dose;
    const scheduled = Date.parse(dose.scheduledAt);
    if (dose.status !== "pendente" || !Number.isFinite(scheduled) || scheduled > now || scheduled < Date.parse(minDate)) { skipped++; continue; }
    if (dose.snoozeUntil && Date.parse(dose.snoozeUntil) > now) { skipped++; continue; }
    if (dose.lastShown && now - Date.parse(dose.lastShown) < 5 * 60_000) { skipped++; continue; }
    const med = meds.get(dose.medId);
    if (!med || med.archivedAt || med.ownerId !== dose.ownerId) { skipped++; continue; }
    const patient = patients.get(dose.patientId)?.name ?? "Paciente";
    const devices = devicesByOwner.get(dose.ownerId) ?? [];
    if (!devices.length) { skipped++; continue; }
    const slot = Math.floor((now - scheduled) / (5 * 60_000));
    const late = now >= scheduled + Math.max(0, Number(med.tolerance) || 0) * 60_000;
    for (const device of devices) {
      // Normal reminders repeat every five minutes; the overdue-care alert is one-time per dose/device.
      const messages = [
        { key: `${dose.id}:${slot}:${device.token.slice(-12)}`, title: `Dose Certa • ${patient}`, body: `Está na hora de tomar ${med.name}${med.dose ? ` — ${med.dose}` : ""}. Abra o Dose Certa para confirmar.` },
        ...(late ? [{ key: `late:${dose.id}:${device.token.slice(-12)}`, title: `Dose pendente • ${patient}`, body: `A dose de ${med.name} continua pendente após o período de tolerância. Confira o Dose Certa; o registro não confirma se o medicamento foi tomado.` }] : []),
      ];
      for (const item of messages) {
        const { data: claimed, error: claimError } = await supabase.rpc("claim_push_delivery", {
          p_key: item.key,
          p_token: device.token,
          p_dose: dose.id,
        });
        if (claimError) { failed++; continue; }
        if (!claimed) { skipped++; continue; }
        try {
          accessToken ??= await googleAccessToken(serviceAccount);
          const sig = await signDoseAction(dose.ownerId, [dose.id]);
          const response = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
            method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              message: {
                token: device.token,
                data: {
                  title: item.title,
                  body: item.body,
                  tag: `dc-${dose.id}`,
                  doseIds: dose.id,
                  owner: dose.ownerId,
                  sig,
                  url: "/",
                },
                android: { priority: "high" },
                webpush: { headers: { Urgency: "high" }, fcmOptions: { link: "/" } },
              },
            }),
          });
          if (!response.ok) {
            const detail = await response.text();
            if (response.status === 404 || (response.status === 400 && /UNREGISTERED|registration-token-not-registered/.test(detail))) await supabase.from("push_devices").delete().eq("token", device.token);
            failed++; continue;
          }
          const { error: markError } = await supabase.from("push_deliveries").update({ sent_at: isoNow }).eq("delivery_key", item.key).eq("device_token", device.token);
          if (markError) failed++; else sent++;
        } catch { failed++; }
      }
    }
  }
  return json({ ok: failed === 0, checkedAt: isoNow, sent, skipped, failed });
});
