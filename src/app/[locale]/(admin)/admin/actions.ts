"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordPaymentSchema } from "./schemas";

type ActionResult = { error: string } | void;

// Admin-only is enforced inside record_payment() itself (private.is_admin()
// check, raises 42501) — not re-checked here, consistent with "auth checks
// belong in DB policies/functions" rather than scattered app-layer guards.
export async function recordPaymentAction(locale: string, formData: FormData): Promise<ActionResult> {
  const parsed = recordPaymentSchema.safeParse({
    coachId: formData.get("coachId"),
    amountEgp: formData.get("amountEgp"),
    method: formData.get("method"),
    reference: formData.get("reference") || undefined,
    periodStart: formData.get("periodStart"),
    periodEnd: formData.get("periodEnd"),
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_payment", {
    p_coach_id: parsed.data.coachId,
    p_amount_egp: parsed.data.amountEgp,
    p_method: parsed.data.method,
    p_period_start: parsed.data.periodStart,
    p_period_end: parsed.data.periodEnd,
    p_reference: parsed.data.reference,
  });
  if (error) {
    if (error.code === "42501") return { error: "forbidden" };
    if (error.code === "P0002") return { error: "not_found" };
    return { error: "invalid_input" };
  }
  revalidatePath(`/${locale}/admin`);
}
