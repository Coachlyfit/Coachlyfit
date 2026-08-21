import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { listExerciseOptions, listFoodOptions } from "@/domain/forms/library-refs";
import type { FormField } from "@/domain/forms/schema";
import type { AppLocale } from "@/domain/locale";
import { FormRenderer } from "@/components/forms-runtime/form-renderer";

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
      "id, answers, submitted_at, clients(display_name), form_template_versions(schema, form_templates!form_template_versions_template_id_fkey(name_ar, name_en))"
    )
    .eq("id", id)
    .maybeSingle();

  if (!submission) notFound();

  const template = submission.form_template_versions?.form_templates;
  const fields = ((submission.form_template_versions?.schema as { fields?: FormField[] } | null)?.fields ??
    []) as FormField[];

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
        </CardHeader>
        <CardContent>
          <FormRenderer
            fields={fields}
            mode="readonly"
            answers={submission.answers as Record<string, unknown>}
            exerciseOptions={exerciseOptions}
            foodOptions={foodOptions}
          />
        </CardContent>
      </Card>
    </div>
  );
}
