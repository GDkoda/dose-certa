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
    const { data: rows } = await db.from("app_records").select("id,payload").eq("owner_id", owner).eq("kind", "doses").in("id", doseIds);
    const now = new Date();
    for (const row of rows ?? []) {
      const p = (row.payload ?? {}) as Record<string, unknown>;
      if (p["status"] !== "pendente") continue;
      const payload = action === "taken"
        ? { ...p, status: "tomado", takenAt: now.toISOString() }
        : { ...p, snoozeUntil: new Date(now.getTime() + 5 * 60_000).toISOString() };
      await db.from("app_records").update({ payload }).eq("id", row.id).eq("owner_id", owner);
    }
    return Response.json({ ok: true });
  } } },
});
