import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyDoseAction } from "@/lib/push-server";

const schema = z.object({ owner: z.string().uuid(), doseIds: z.array(z.string().min(1).max(300)).min(1).max(20), sig: z.string().min(10).max(200), action: z.enum(["taken", "snooze"]) });

// Called by the service worker when the user taps a notification button. Authorized by an HMAC signature.
export const Route = createFileRoute("/api/public/dose-action")({
  server: { handlers: { POST: async ({ request }) => {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return new Response("Invalid", { status: 400 });
    const { owner, doseIds, sig, action } = parsed.data;
    if (!(await verifyDoseAction(owner, doseIds, sig))) return new Response("Forbidden", { status: 403 });
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: rows, error: readError } = await db.from("app_records")
      .select("id,payload")
      .eq("owner_id", owner)
      .eq("kind", "doses")
      .in("id", doseIds);
    if (readError) return new Response("Could not load dose records", { status: 500 });

    const now = new Date();
    for (const row of rows ?? []) {
      const dose = (row.payload ?? {}) as Record<string, unknown>;
      // A repeated click or a duplicate push action must never consume stock twice.
      if (dose["status"] !== "pendente") continue;

      if (action === "taken") {
        const updatedDose = { ...dose, status: "tomado", takenAt: now.toISOString() };
        const { error: doseError } = await db.from("app_records")
          .update({ payload: updatedDose })
          .eq("id", row.id)
          .eq("owner_id", owner);
        if (doseError) return new Response("Could not confirm dose", { status: 500 });

        const medId = typeof dose["medId"] === "string" ? dose["medId"] : "";
        if (medId) {
          const { data: medication, error: medReadError } = await db.from("app_records")
            .select("id,payload")
            .eq("owner_id", owner)
            .eq("kind", "meds")
            .eq("id", medId)
            .maybeSingle();
          if (medReadError) return new Response("Could not load medication stock", { status: 500 });
          if (medication) {
            const med = (medication.payload ?? {}) as Record<string, unknown>;
            const stock = Number(med["stock"]);
            const configuredQuantity = Number(med["quantityPerDose"]);
            const quantity = Number.isFinite(configuredQuantity) && configuredQuantity > 0 ? configuredQuantity : 1;
            if (Number.isFinite(stock)) {
              const { error: stockError } = await db.from("app_records")
                .update({ payload: { ...med, stock: Math.max(0, stock - quantity) } })
                .eq("id", medication.id)
                .eq("owner_id", owner);
              if (stockError) return new Response("Could not update medication stock", { status: 500 });
            }
          }
        }
      } else {
        const updatedDose = { ...dose, snoozeUntil: new Date(now.getTime() + 5 * 60_000).toISOString() };
        const { error: doseError } = await db.from("app_records")
          .update({ payload: updatedDose })
          .eq("id", row.id)
          .eq("owner_id", owner);
        if (doseError) return new Response("Could not postpone dose", { status: 500 });
      }
    }
    return Response.json({ ok: true });
  } } },
});
