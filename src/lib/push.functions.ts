import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const registerPushDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ token: z.string().min(20).max(4096), timezone: z.string().min(1).max(100) }).parse(input))
  .handler(async ({ data, context }) => {
    try { new Intl.DateTimeFormat("en", { timeZone: data.timezone }); } catch { throw new Error("Fuso horário inválido."); }
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