"use server";

import { headers } from "next/headers";
import { parseSubmitOutcome } from "@/domain/coaching-applications/outcome";
import { applicationSchema, type ApplicationInput } from "@/domain/coaching-applications/schema";
import { notifyCoachOfApplication } from "@/lib/email/coaching-applications";
import { clientIp } from "@/lib/sites/client-ip";
import { createAnonClient } from "@/lib/supabase/anon";

// Public, unauthenticated. Goes through the submit_coaching_application RPC
// (validates, rate limits, resolves the coach from the site key); nothing here
// reads or writes a table directly.

export type ApplyResult = { ok: true } | { error: "invalid_input" | "rate_limited" | "not_found" | "failed" };

export async function submitApplicationAction(siteKey: string, input: ApplicationInput): Promise<ApplyResult> {
  const parsed = applicationSchema.safeParse(input);
  if (!parsed.success || !siteKey) return { error: "invalid_input" };
  const a = parsed.data;

  const h = await headers();
  const { data, error } = await createAnonClient().rpc("submit_coaching_application", {
    p_key: siteKey,
    p_name: a.name,
    p_email: a.email,
    p_phone: a.phone,
    p_goal: a.goal,
    p_activity_level: a.activityLevel,
    p_source: a.source || undefined,
    p_message: a.message || undefined,
    p_ip: clientIp(h.get("x-forwarded-for")) ?? undefined,
  });
  if (error) return { error: "failed" };

  const outcome = parseSubmitOutcome(data);
  if (!outcome.ok) return { error: outcome.error };

  await notifyCoachOfApplication(outcome.id, a);
  return { ok: true };
}
