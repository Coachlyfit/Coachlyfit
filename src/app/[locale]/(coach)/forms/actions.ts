"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { TemplatesService } from "@/domain/forms/templates.service";
import { SubmissionsService } from "@/domain/forms/submissions.service";
import { formTemplateSchema, type FormField } from "@/domain/forms/schema";
import { FORM_STARTERS } from "@/domain/forms/starters";
import { findPublishIssue } from "@/domain/forms/publish-check";
import { createTemplateSchema, assignFormSchema, type CreateTemplateInput } from "./schemas";

type ActionResult = { error: string } | void;

/** form_templates_require_feature (20261018000001) refuses a new template on
 * a plan without forms_builder. */
function isUpgradeRequired(error: unknown): boolean {
  return (error as { hint?: string } | null)?.hint === "upgrade_required";
}

export async function createTemplateAction(locale: string, input: CreateTemplateInput): Promise<ActionResult> {
  const parsed = createTemplateSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const { starter, ...names } = parsed.data;

  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" };

  const fields = starter ? FORM_STARTERS[names.kind].fields : [];
  let templateId: string;
  try {
    const template = await new TemplatesService(supabase).create(coachId, {
      ...names,
      // Saved as a draft, not published: the coach reviews it in the builder first.
      draft_schema: fields.length > 0 ? { version: 1, fields } : null,
    });
    templateId = template.id;
  } catch (error) {
    return { error: isUpgradeRequired(error) ? "upgrade_required" : "create_failed" };
  }
  revalidatePath(`/${locale}/forms`);
  redirect(`/${locale}/forms/${templateId}`);
}

export async function publishTemplateAction(
  locale: string,
  templateId: string,
  fields: FormField[]
): Promise<ActionResult> {
  const parsed = formTemplateSchema.safeParse({ version: 1, fields });
  if (!parsed.success) return { error: "invalid_input" };
  // The builder checks this before calling; repeated here because a client
  // fills in whatever gets published.
  const issue = findPublishIssue(parsed.data.fields);
  if (issue) return { error: `publish_${issue.code}` };

  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" };

  try {
    await new TemplatesService(supabase).publish(coachId, templateId, parsed.data);
  } catch {
    return { error: "publish_failed" };
  }
  revalidatePath(`/${locale}/forms`);
  revalidatePath(`/${locale}/forms/${templateId}`);
}

/** The builder's debounced autosave. No revalidatePath on purpose: it would
 * re-render the builder page under the coach on every pause in typing, and
 * the list refetches when navigated to. */
export async function saveDraftAction(templateId: string, fields: FormField[]): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(templateId);
  const parsed = formTemplateSchema.safeParse({ version: 1, fields });
  if (!id.success || !parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  try {
    await new TemplatesService(supabase).saveDraft(id.data, parsed.data);
  } catch {
    return { error: "save_failed" };
  }
}

export async function renameTemplateAction(
  locale: string,
  templateId: string,
  names: { name_ar: string; name_en: string }
): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(templateId);
  const parsed = createTemplateSchema.pick({ name_ar: true, name_en: true }).safeParse(names);
  if (!id.success || !parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  try {
    await new TemplatesService(supabase).rename(id.data, parsed.data);
  } catch {
    return { error: "rename_failed" };
  }
  revalidatePath(`/${locale}/forms`);
}

export async function duplicateTemplateAction(locale: string, templateId: string): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(templateId);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" };

  try {
    await new TemplatesService(supabase).duplicate(coachId, parsed.data);
  } catch (error) {
    return { error: isUpgradeRequired(error) ? "upgrade_required" : "duplicate_failed" };
  }
  revalidatePath(`/${locale}/forms`);
}

export async function archiveTemplateAction(locale: string, templateId: string): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(templateId);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  try {
    await new TemplatesService(supabase).archive(parsed.data);
  } catch {
    return { error: "delete_failed" };
  }
  revalidatePath(`/${locale}/forms`);
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
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return { error: "not_authenticated" };

  await new SubmissionsService(supabase).assign(coachId, {
    clientId: parsed.data.clientId,
    templateVersionId,
    dueAt: parsed.data.dueAt,
  });
  revalidatePath(`/${locale}/forms`);
}

export async function markSubmissionReviewedAction(locale: string, submissionId: string): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(submissionId);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  try {
    await new SubmissionsService(supabase).markReviewed(parsed.data);
  } catch {
    return { error: "review_failed" };
  }
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/forms/submissions`);
  revalidatePath(`/${locale}/forms/submissions/${parsed.data}`);
}
