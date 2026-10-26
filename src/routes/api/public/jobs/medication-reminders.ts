import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { pushSlot, scheduledInTimezone } from "@/lib/push-rules";
import type { Dose } from "@/lib/store";
import { z } from "zod";

export const Route = createFileRoute("/api/public/jobs/medication-reminders")({
  server: { handlers: { POST: async ({ request }) => {
    const failure = await authenticateCronRequest(request);
    if (failure) return failure;
    const key = process.env["LOVABLE_API_KEY"];
    const connection = process.env["FIREBASE_MESSAGING_API_KEY"];
    if (!key || !connection) return new Response("Notification service unavailable", { status: 503 });
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: devices, error } = await db.from("push_devices").select("*");
    if (error) return new Response("Could not load devices", { status: 500 });
    const now = Date.now(); let sent = 0; let failed = 0;
    const medSchema = z.object({ patientId: z.string(), times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)) });
    const doseSchema = z.object({ medId: z.string(), patientId: z.string(), scheduledAt: z.string().datetime(), status: z.enum(["pendente", "tomado", "nao_tomado"]), snoozeUntil: z.string().optional(), lastShown: z.string().optional() });
    for (const owner of new Set((devices ?? []).map((device) => device.owner_id))) {
      const owned = (devices ?? []).filter((device) => device.owner_id === owner);
      const { data: roles } = await db.from("user_roles").select("role").eq("user_id", owner);
      if (!roles?.some((role) => role.role === "cuidador")) continue;
      const { data: records, error: readError } = await db.from("app_records").select("*").eq("owner_id", owner).in("kind", ["meds", "doses"]);
      if (readError) { failed++; continue; }
      const doses: Dose[] = [];
      for (const record of records ?? []) {
        if (record.kind !== "doses") continue;
        const parsed = doseSchema.safeParse(record.payload);
        if (parsed.success) doses.push({ medId: parsed.data.medId, patientId: parsed.data.patientId, scheduledAt: parsed.data.scheduledAt, status: parsed.data.status, ...(parsed.data.snoozeUntil ? { snoozeUntil: parsed.data.snoozeUntil } : {}), ...(parsed.data.lastShown ? { lastShown: parsed.data.lastShown } : {}), id: record.id, ownerId: owner });
      }
      // Generate daily doses even when the caregiver never opens the page.
      const timezone = owned[0]?.timezone ?? "UTC";
      const dayParts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now)).map((part) => [part.type, part.value]));
      const day = `${dayParts['year']}-${dayParts['month']}-${dayParts['day']}`;
      for (const record of records ?? []) {
        if (record.kind !== "meds") continue;
        const parsed = medSchema.safeParse(record.payload); if (!parsed.success) continue;
        for (const time of parsed.data.times) {
          const scheduledAt = scheduledInTimezone(day, time, timezone);
          if (doses.some((dose) => dose.medId === record.id && dose.scheduledAt === scheduledAt)) continue;
          const id = `scheduled-${record.id}-${scheduledAt}`;
          const dose: Dose = { id, ownerId: owner, medId: record.id, patientId: parsed.data.patientId, scheduledAt, status: "pendente" };
          const { error: createError } = await db.from("app_records").upsert({ id, owner_id: owner, kind: "doses", payload: { ...dose } }, { ignoreDuplicates: true });
          if (!createError) doses.push(dose);
        }
      }
      for (const dose of doses) {
        const slot = pushSlot(dose, now); if (slot === null) continue;
        // Re-read the current status so a completed or snoozed dose is not sent from stale data.
        const { data: latest } = await db.from("app_records").select("payload").eq("id", dose.id).maybeSingle();
        const current = doseSchema.safeParse(latest?.payload);
        if (!current.success || pushSlot(current.data, now) === null) continue;
        for (const device of owned) {
          const deliveryKey = `${dose.id}:${device.token}:${slot}`;
          const { data: claimed, error: claimError } = await db.rpc("claim_push_delivery", { p_key: deliveryKey, p_token: device.token, p_dose: dose.id });
          if (claimError || !claimed) continue;
          try {
            const response = await fetch("https://connector-gateway.lovable.dev/firebase_messaging/v1/projects/_/messages:send", { method: "POST", headers: { Authorization: `Bearer ${key}`, "X-Connection-Api-Key": connection, "Content-Type": "application/json" }, body: JSON.stringify({ message: { token: device.token, notification: { title: "Dose Certa", body: "Há um medicamento no horário. Abra o Dose Certa para conferir e registrar a dose." }, webpush: { headers: { TTL: "300", Urgency: "high" }, notification: { tag: dose.id }, fcm_options: { link: new URL("/", request.url).href } } } }) });
            if (!response.ok) {
              const body = await response.text();
              console.error("Medication push failed", response.status);
              if (response.status === 404 && body.includes("UNREGISTERED")) await db.from("push_devices").delete().eq("token", device.token);
              failed++; continue;
            }
            await db.from("push_deliveries").update({ sent_at: new Date().toISOString() }).eq("delivery_key", deliveryKey); sent++;
          } catch { failed++; }
        }
      }
    }
    return Response.json({ sent, failed });
  } } },
});