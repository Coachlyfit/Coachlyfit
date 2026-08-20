"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { roleHome } from "@/lib/auth/role-home";
import { InvitesService } from "@/domain/clients/invites.service";
import { toInvites, type ImportField } from "@/domain/clients/import";
import { TemplatesService } from "@/domain/forms/templates.service";
import { trainingModeSchema, importClientsSchema, templateKeySchema } from "./schemas";
import { SEED_TEMPLATES } from "./seed-templates";

type ActionResult = { error: string } | void;

export async function saveTrainingModeAction(locale: string, formData: FormData): Promise<ActionResult> {
  const parsed = trainingModeSchema.safeParse({ trainingMode: formData.get("trainingMode") });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { error } = await supabase
    .from("coaches")
    .update({ training_mode: parsed.data.trainingMode })
    .eq("id", user.id);
  if (error) return { error: "save_failed" };
  revalidatePath(`/${locale}/onboarding`);
}

type ImportResult = { error: string } | { created: { clientId: string; token: string; displayName: string }[]; failed: number };

// Plain-object payload rather than FormData, matching publishTemplateAction
// — the mapped rows are dynamic data, not a fixed set of named fields.
export async function importClientsAction(
  locale: string,
  rows: string[][],
  fields: string[]
): Promise<ImportResult> {
  const parsed = importClientsSchema.safeParse({ rows, fields });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const invites = toInvites(parsed.data.rows, parsed.data.fields as ImportField[]);
  if (invites.length === 0) return { error: "no_rows" };

  const result = await new InvitesService(supabase).createInvites(user.id, invites);
  revalidatePath(`/${locale}/clients`);
  return result;
}

export async function createStarterTemplateAction(locale: string, formData: FormData): Promise<ActionResult> {
  const parsed = templateKeySchema.safeParse({ templateKey: formData.get("templateKey") });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const seed = SEED_TEMPLATES[parsed.data.templateKey];
  try {
    const service = new TemplatesService(supabase);
    const template = await service.create(user.id, { kind: seed.kind, name_ar: seed.name_ar, name_en: seed.name_en });
    await service.publish(user.id, template.id, seed.schema);
  } catch {
    return { error: "template_failed" };
  }
  revalidatePath(`/${locale}/forms`);
}

export async function completeOnboardingAction(locale: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { error } = await supabase
    .from("coaches")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: "save_failed" };

  // revalidatePath before redirect: code after redirect() never runs
  // (it throws), so the dashboard must already be fresh by then.
  revalidatePath(`/${locale}/dashboard`);
  redirect(roleHome(locale, "coach"));
}
