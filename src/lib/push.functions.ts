import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const registerPushDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ token: z.string().min(20).max(4096), timezone: z.string().min(1).max(100) }).parse(input))
  .handler(async ({ data, context }) => {
    try { new Intl.DateTimeFormat("en", { timeZone: data.timezone }); } catch { throw new Error("Fuso horário inválido."); }
    // The same phone may switch accounts: drop the token from any previous owner first.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("push_devices").delete().eq("token", data.token).neq("owner_id", context.userId);
    const { error } = await context.supabase.from("push_devices").upsert({ ...data, owner_id: context.userId, updated_at: new Date().toISOString() });
    if (error) throw new Error("Não foi possível ativar os avisos neste aparelho.");
    return { ok: true };
  });

export const removePushDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ token: z.string().min(20).max(4096) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("push_devices").delete().eq("token", data.token).eq("owner_id", context.userId);
    if (error) throw new Error("Não foi possível desativar os avisos.");
    return { ok: true };
  });

export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: devices, error } = await context.supabase.from("push_devices").select("token").eq("owner_id", context.userId);
    if (error) throw new Error("Não foi possível ler seus aparelhos.");
    if (!devices?.length) return { sent: 0, devices: 0 };
    const { sendPush } = await import("@/lib/push-server");
    await new Promise((r) => setTimeout(r, 3000));
    let sent = 0;
    for (const d of devices) {
      const r = await sendPush(d.token, { title: "Teste de alarme • Dose Certa", body: "Se você está vendo isto com o app fechado, os avisos estão funcionando!", tag: `dc-test-${Date.now()}`, url: "/", owner: context.userId, doseIds: [], sig: "", test: true });
      if (r.ok) sent++; else console.error("Test push failed", r.status, r.body.slice(0, 300));
    }
    return { sent, devices: devices.length };
  });
