import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { pushSlot, scheduledInTimezone } from "@/lib/push-rules";
import type { Dose } from "@/lib/store";
import { z } from "zod";
import { sendPush, signDoseAction } from "@/lib/push-server";

export const Route = createFileRoute("/api/public/jobs/medication-reminders")({
  server: { handlers: { POST: async ({ request }) => {
    const failure = await authenticateCronRequest(request);
    if (failure) return failure;
    if (!process.env["LOVABLE_API_KEY"] || !process.env["FIREBASE_MESSAGING_API_KEY"]) return new Response("Notification service unavailable", { status: 503 });
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: devices, error } = await db.from("push_devices").select("*");
    if (error) return new Response("Could not load devices", { status: 500 });
    const now = Date.now(); let sent = 0; let failed = 0;
    const medSchema = z.object({ patientId: z.string(), times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)), archivedAt: z.string().optional() });
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
      const timezone = [...owned]
        .sort((a, b) => Date.parse(String(b.updated_at ?? "")) - Date.parse(String(a.updated_at ?? "")))[0]?.timezone ?? "UTC";
      const dayParts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now)).map((part) => [part.type, part.value]));
      const day = `${dayParts['year']}-${dayParts['month']}-${dayParts['day']}`;
      for (const record of records ?? []) {
        if (record.kind !== "meds") continue;
        const parsed = medSchema.safeParse(record.payload); if (!parsed.success || parsed.data.archivedAt) continue;
        for (const time of parsed.data.times) {
          const scheduledAt = scheduledInTimezone(day, time, timezone);
          if (doses.some((dose) => dose.medId === record.id && dose.scheduledAt === scheduledAt)) continue;
          const id = `scheduled-${record.id}-${scheduledAt}`;
          const dose: Dose = { id, ownerId: owner, medId: record.id, patientId: parsed.data.patientId, scheduledAt, status: "pendente" };
          const { error: createError } = await db.from("app_records").upsert({ id, owner_id: owner, kind: "doses", payload: { ...dose } }, { ignoreDuplicates: true });
          if (!createError) doses.push(dose);
        }
      }
      // Group pending doses of the same patient at the same time into one notification.
      const names = new Map<string, string>(); const medInfo = new Map<string, { name: string; dose: string; archived: boolean }>();
      const { data: pats } = await db.from("app_records").select("id,payload").eq("owner_id", owner).eq("kind", "patients");
      for (const p of pats ?? []) names.set(p.id, String((p.payload as Record<string, unknown>)?.["name"] ?? "Paciente"));
      for (const r of records ?? []) if (r.kind === "meds") {
        const m = r.payload as Record<string, unknown>;
        medInfo.set(r.id, { name: String(m?.["name"] ?? "Medicamento"), dose: String(m?.["dose"] ?? ""), archived: Boolean(m?.["archivedAt"]) });
      }
      const groups = new Map<string, { patientId: string; scheduledAt: string; slot: number; doses: Dose[] }>();
      for (const dose of doses) {
        if (medInfo.get(dose.medId)?.archived) continue;
        const slot = pushSlot(dose, now); if (slot === null) continue;
        const gk = `${dose.patientId}|${dose.scheduledAt}`;
        const g = groups.get(gk) ?? { patientId: dose.patientId, scheduledAt: dose.scheduledAt, slot, doses: [] };
        g.slot = Math.max(g.slot, slot); g.doses.push(dose); groups.set(gk, g);
      }
      for (const g of groups.values()) {
        const hhmm = new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(g.scheduledAt));
        const patient = names.get(g.patientId) ?? "Paciente";
        const groupId = `${g.patientId}-${g.scheduledAt}`;
        for (const device of owned) {
          const claimedDoses: Dose[] = [];
          const deliveryKeys: string[] = [];

          // The per-dose key is shared with the Edge Function sender. Whichever
          // scheduler claims first owns this dose/device/five-minute slot.
          for (const dose of g.doses) {
            const deliveryKey = `${dose.id}:${g.slot}:${device.token.slice(-12)}`;
            const { data: claimed, error: claimError } = await db.rpc("claim_push_delivery", {
              p_key: deliveryKey,
              p_token: device.token,
              p_dose: dose.id,
            });
            if (claimError) {
              console.error("Could not claim medication push", claimError.message);
              failed++;
              continue;
            }
            if (!claimed) continue;
            claimedDoses.push(dose);
            deliveryKeys.push(deliveryKey);
          }

          if (!claimedDoses.length) continue;
          const doseIds = claimedDoses.map((dose) => dose.id);
          const sig = await signDoseAction(owner, doseIds);
          const lines = claimedDoses.map((dose) => {
            const med = medInfo.get(dose.medId);
            return med ? `${med.name}${med.dose ? ` — ${med.dose}` : ""}` : "Medicamento";
          });
          const title = claimedDoses.length > 1
            ? `${patient}: ${claimedDoses.length} medicamentos às ${hhmm}`
            : `${patient}: hora do remédio (${hhmm})`;

          try {
            const r = await sendPush(device.token, {
              title,
              body: lines.join("\n"),
              tag: `dc-${groupId}`,
              url: new URL("/", request.url).href,
              owner,
              doseIds,
              sig,
            });
            if (!r.ok) {
              console.error("Medication push failed", r.status, r.body.slice(0, 300));
              if (r.status === 404 || (r.status === 400 && r.body.includes("INVALID_ARGUMENT") && r.body.includes("token"))) {
                await db.from("push_devices").delete().eq("token", device.token);
              }
              failed++;
              continue;
            }
            await db.from("push_deliveries")
              .update({ sent_at: new Date().toISOString() })
              .in("delivery_key", deliveryKeys)
              .eq("device_token", device.token);
            sent++;
          } catch {
            failed++;
          }
        }
      }
    }
    return Response.json({ sent, failed });
  } } },
});