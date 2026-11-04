import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const confirmDoseSchema = z.object({ doseId: z.string().min(1).max(300) });

/** Confirms a caregiver's own dose and deducts its stock in one database transaction. */
export const confirmDoseTaken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => confirmDoseSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: confirmed, error } = await supabaseAdmin.rpc("confirm_doses_and_deduct_stock", {
      p_owner: context.userId,
      p_dose_ids: [data.doseId],
      p_taken_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[confirmDoseTaken] atomic confirmation failed", {
        code: error.code,
        message: error.message,
      });
      throw new Error("Não foi possível registrar a dose. Tente novamente.");
    }

    return { ok: true, confirmed: Array.isArray(confirmed) && confirmed.length > 0 };
  });
