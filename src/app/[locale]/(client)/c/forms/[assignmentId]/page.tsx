import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { listExerciseOptions, listFoodOptions } from "@/domain/forms/library-refs";
import { SubmissionsService } from "@/domain/forms/submissions.service";
import type { FormField } from "@/domain/forms/schema";
import { FillFormClient } from "./fill-form-client";

export default async function ClientFillFormPage({
  params,
}: {
  params: Promise<{ locale: string; assignmentId: string }>;
}) {
  const { locale, assignmentId } = await params;
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("form_assignments")
    .select(
      "id, status, client_id, coach_id, form_template_versions(template_id, schema, form_templates(name_ar, name_en)), coaches(business_name)"
    )
    .eq("id", assignmentId)
    .maybeSingle();

  if (!assignment) notFound();

  if (assignment.status === "completed") {
    const t = await getTranslations("forms.fill");
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {t("submitted")}
        </CardContent>
      </Card>
    );
  }

  const template = assignment.form_template_versions?.form_templates;
  const templateId = assignment.form_template_versions?.template_id;
  const fields = ((assignment.form_template_versions?.schema as { fields?: FormField[] } | null)?.fields ??
    []) as FormField[];
  const formName = template ? (locale === "ar" ? template.name_ar : template.name_en) : "";
  const coachName = assignment.coaches?.business_name ?? "";

  const needsExerciseOptions = fields.some((f) => f.type === "exercise_ref");
  const needsFoodOptions = fields.some((f) => f.type === "food_ref");
  const [exerciseOptions, foodOptions, previousAnswers] = await Promise.all([
    needsExerciseOptions ? listExerciseOptions(supabase) : Promise.resolve(undefined),
    needsFoodOptions ? listFoodOptions(supabase) : Promise.resolve(undefined),
    templateId
      ? new SubmissionsService(supabase).getPreviousAnswers(assignment.client_id, templateId, assignmentId)
      : Promise.resolve(null),
  ]);

  return (
    // Fixed full-bleed overlay: the (client)/c layout wraps every route in
    // header/nav chrome and a max-w-lg column for the auth-guard's sake,
    // but this design is a bare full-viewport screen. A layout can't opt a
    // single route out of its parent's chrome in the App Router, so this
    // covers it visually instead of fighting the tree.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background px-5">
      <FillFormClient
        locale={locale}
        assignmentId={assignmentId}
        fields={fields}
        coachName={coachName}
        formName={formName}
        previousAnswers={previousAnswers}
        uploadContext={{ coachId: assignment.coach_id, clientId: assignment.client_id }}
        exerciseOptions={exerciseOptions}
        foodOptions={foodOptions}
      />
    </div>
  );
}
