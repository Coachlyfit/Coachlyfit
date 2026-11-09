import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { listExerciseOptions, listFoodOptions } from "@/domain/forms/library-refs";
import { ProgressService } from "@/domain/progress/progress.service";
import type { FormField } from "@/domain/forms/schema";
import type { AppLocale } from "@/domain/locale";
import { FormRenderer } from "@/components/forms-runtime/form-renderer";
import { MarkReviewedButton } from "./mark-reviewed-button";

export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("forms.submissions");
  const supabase = await createClient();

  const { data: submission } = await supabase
    .from("form_submissions")
    .select(
      "id, answers, submitted_at, reviewed_at, clients(display_name), form_template_versions(schema, form_templates!form_template_versions_template_id_fkey(name_ar, name_en))"
    )
    .eq("id", id)
    .maybeSingle();

  if (!submission) notFound();

  const template = submission.form_template_versions?.form_templates;
  const fields = ((submission.form_template_versions?.schema as { fields?: FormField[] } | null)?.fields ??
    []) as FormField[];

  // The `progress-media` bucket is private, so photo storage paths stored in
  // `answers` must be turned into signed URLs before the coach can view them.
  // Sign once in a batch and hand the path -> URL map down to the renderer.
  const progress = new ProgressService(supabase);
  const answers = submission.answers as Record<string, unknown>;
  const photoPaths: string[] = [];
  for (const field of fields) {
    if (field.type !== "photo") continue;
    const raw = answers[field.id];
    if (Array.isArray(raw)) photoPaths.push(...raw.filter((v): v is string => typeof v === "string"));
    else if (typeof raw === "string") photoPaths.push(raw);
  }
  const signed = await progress.signMediaUrls(photoPaths);
  const signedUrls = Object.fromEntries(signed);

  const needsExerciseOptions = fields.some((f) => f.type === "exercise_ref");
  const needsFoodOptions = fields.some((f) => f.type === "food_ref");
  const [exerciseOptions, foodOptions] = await Promise.all([
    needsExerciseOptions ? listExerciseOptions(supabase) : Promise.resolve(undefined),
    needsFoodOptions ? listFoodOptions(supabase) : Promise.resolve(undefined),
  ]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {template ? (locale === "ar" ? template.name_ar : template.name_en) : t("title")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {submission.clients?.display_name} · {formatDate(submission.submitted_at, locale)}
          </p>
          <CardAction>
            {submission.reviewed_at ? (
              <StatusBadge tone="success">{t("reviewed")}</StatusBadge>
            ) : (
              <MarkReviewedButton locale={locale} submissionId={submission.id} />
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          <FormRenderer
            fields={fields}
            mode="readonly"
            answers={submission.answers as Record<string, unknown>}
            exerciseOptions={exerciseOptions}
            foodOptions={foodOptions}
            signedUrls={signedUrls}
          />
        </CardContent>
      </Card>
    </div>
  );
}
