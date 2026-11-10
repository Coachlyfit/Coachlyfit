import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listExerciseOptions, listFoodOptions } from "@/domain/forms/library-refs";
import { streakDays, streakLength } from "@/domain/forms/client-list";
import { SubmissionsService } from "@/domain/forms/submissions.service";
import { ProgressService } from "@/domain/progress/progress.service";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { FormField } from "@/domain/forms/schema";
import { FillFormClient } from "./fill-form-client";
import { SubmittedView } from "./submitted-view";

// Long enough to carry a daily streak, short enough to stay a tiny query.
const STREAK_LOOKBACK_DAYS = 60;

export default async function ClientFillFormPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; assignmentId: string }>;
}) {
  const { locale, assignmentId } = await params;
  const supabase = await createClient();

  // RLS (client_read_own) means a foreign or unknown id is simply "not found".
  const { data: assignment } = await supabase
    .from("form_assignments")
    .select(
      "id, status, client_id, coach_id, form_template_versions(template_id, schema, form_templates!form_template_versions_template_id_fkey(name_ar, name_en))"
    )
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) notFound();

  const version = assignment.form_template_versions;
  const templateId = version?.template_id;
  const fields = ((version?.schema as { fields?: FormField[] } | null)?.fields ?? []) as FormField[];
  const template = version?.form_templates;
  const formName = template ? pickLocale(template, locale) : "";

  const [exerciseOptions, foodOptions] = await Promise.all([
    fields.some((f) => f.type === "exercise_ref") ? listExerciseOptions(supabase) : Promise.resolve(undefined),
    fields.some((f) => f.type === "food_ref") ? listFoodOptions(supabase) : Promise.resolve(undefined),
  ]);

  if (assignment.status === "completed") {
    const { data: submission } = await supabase
      .from("form_submissions")
      .select("answers, submitted_at, reviewed_at")
      .eq("assignment_id", assignmentId)
      .maybeSingle();
    const answers = (submission?.answers ?? {}) as Record<string, unknown>;

    const photoPaths = fields
      .filter((f) => f.type === "photo")
      .flatMap((f) => {
        const v = answers[f.id];
        return Array.isArray(v) ? v.filter((p): p is string => typeof p === "string") : typeof v === "string" ? [v] : [];
      });
    const signed = await new ProgressService(supabase).signMediaUrls(photoPaths).catch(() => new Map<string, string>());

    return (
      <SubmittedView
        locale={locale}
        formName={formName}
        fields={fields}
        answers={answers}
        submittedAt={submission?.submitted_at ?? null}
        reviewed={!!submission?.reviewed_at}
        signedUrls={Object.fromEntries(signed)}
        exerciseOptions={exerciseOptions}
        foodOptions={foodOptions}
      />
    );
  }

  const now = new Date();
  const since = new Date(now.getTime() - STREAK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: draft }, previousAnswers, { data: recent }] = await Promise.all([
    supabase.from("form_drafts").select("answers, current_field_id").eq("assignment_id", assignmentId).maybeSingle(),
    templateId
      ? new SubmissionsService(supabase).getPreviousAnswers(assignment.client_id, templateId, assignmentId)
      : Promise.resolve(null),
    templateId
      ? supabase
          .from("form_submissions")
          .select("submitted_at, form_template_versions!inner(template_id)")
          .eq("form_template_versions.template_id", templateId)
          .gte("submitted_at", since)
      : Promise.resolve({ data: [] as { submitted_at: string }[] }),
  ]);

  // Streak only for forms that behave like a daily one (see streakDays); the
  // +1 counts the submission the client is about to make today.
  const priorDates = (recent ?? []).map((r) => r.submitted_at);
  const streakCount = streakDays(priorDates, now) ? streakLength(priorDates, now) + 1 : null;

  return (
    // Mobile: a bare full-screen flow over the layout chrome (header + bottom
    // nav) — a layout can't opt one route out of its parent's chrome, so this
    // covers it. Desktop: sits in the column beside the list.
    <div className="max-lg:fixed max-lg:inset-0 max-lg:z-50 max-lg:overflow-y-auto max-lg:bg-background max-lg:px-5">
      <FillFormClient
        locale={locale}
        assignmentId={assignmentId}
        formName={formName}
        fields={fields}
        initialAnswers={(draft?.answers ?? {}) as Record<string, unknown>}
        initialFieldId={draft?.current_field_id ?? null}
        previousAnswers={previousAnswers}
        uploadContext={{ coachId: assignment.coach_id, clientId: assignment.client_id }}
        exerciseOptions={exerciseOptions}
        foodOptions={foodOptions}
        streakCount={streakCount}
      />
    </div>
  );
}
