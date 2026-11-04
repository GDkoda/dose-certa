import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyDoseAction } from "@/lib/push-server";

const schema = z.object({
  owner: z.string().uuid(),
  doseIds: z.array(z.string().min(1).max(300)).min(1).max(20).refine((ids) => new Set(ids).size === ids.length),
  sig: z.string().min(10).max(200),
  action: z.enum(["taken", "snooze"]),
});

// The service worker can act without a browser session only with a valid server HMAC.
export const Route = createFileRoute("/api/public/dose-action")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = schema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid", { status: 400 });

        const { owner, doseIds, sig, action } = parsed.data;
        try {
          if (!(await verifyDoseAction(owner, doseIds, sig))) return new Response("Forbidden", { status: 403);
        } catch {
          return new Response("Notification actions are not configured", { status: 503 });
        }

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const now = new Date();

        if (action === "taken") {
          const { data: confirmed, error } = await db.rpc("confirm_doses_and_deduct_stock", {
            p_owner: owner,
            p_dose_ids: doseIds,
            p_taken_at: now.toISOString(),
          });
          if (error) {
            console.error("[dose-action] atomic confirmation failed", { code: error.code, message: error.message });
            return new Response("Could not confirm dose", { status: 500 });
          }
          const confirmedDoseIds = Array.isArray(confirmed)
            ? confirmed.map((row: { dose_id?: unknown }) => String(row.dose_id ?? "")).filter(Boolean)
            : [];
          return Response.json({ ok: true, action, doseIds, confirmedDoseIds });
        }

        const { data: rows, error: readError } = await db.from("app_records")
          .select("id,payload")
          .eq("owner_id", owner)
          .eq("kind", "doses")
          .in("id", doseIds);
        if (readError) return new Response("Could not load dose records", { status: 500 });

        const snoozeUntil = new Date(now.getTime() + 5 * 60_000).toISOString();
        for (const row of rows ?? []) {
          const dose = (row.payload ?? {}) as Record<string, unknown>;
          if (dose["status"] !== "pendente") continue;
          const { error } = await db.from("app_records")
            .update({ payload: { ...dose, snoozeUntil } })
            .eq("id", row.id)
            .eq("owner_id", owner)
            .eq("kind", "doses")
            .filter("payload->>status", "eq", "pendente");
          if (error) return new Response("Could not postpone dose", { status: 500 });
        }

        return Response.json({ ok: true, action, doseIds, snoozeUntil });
      },
    },
  },
});
