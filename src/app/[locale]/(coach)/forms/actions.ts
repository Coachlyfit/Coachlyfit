"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TemplatesService } from "@/domain/forms/templates.service";
import { SubmissionsService } from "@/domain/forms/submissions.service";
import { formTemplateSchema, type FormField } from "@/domain/forms/schema";
import { createTemplateSchema, assignFormSchema } from "./schemas";

type ActionResult = { error: string } | void;

export async function createTemplateAction(locale: string, formData: FormData) {
  const parsed = createTemplateSchema.safeParse({
    kind: formData.get("kind"),
    name_ar: formData.get("name_ar"),
    name_en: formData.get("name_en"),
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const template = await new TemplatesService(supabase).create(user.id, parsed.data);
  redirect(`/${locale}/forms/${template.id}`);
}

export async function publishTemplateAction(
  locale: string,
  templateId: string,
  fields: FormField[]
): Promise<ActionResult> {
  const parsed = formTemplateSchema.safeParse({ version: 1, fields });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  try {
    await new TemplatesService(supabase).publish(user.id, templateId, parsed.data);
  } catch {
    return { error: "publish_failed" };
  }
  revalidatePath(`/${locale}/forms/${templateId}`);
}

export async function assignTemplateAction(
  locale: string,
  templateVersionId: string,
  formData: FormData
): Promise<ActionResult> {
  const parsed = assignFormSchema.safeParse({
    clientId: formData.get("clientId"),
    dueAt: formData.get("dueAt") || undefined,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  await new SubmissionsService(supabase).assign(user.id, {
    clientId: parsed.data.clientId,
    templateVersionId,
    dueAt: parsed.data.dueAt,
  });
  revalidatePath(`/${locale}/forms`);
}
