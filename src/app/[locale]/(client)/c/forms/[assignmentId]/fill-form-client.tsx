"use client";

import { useRouter } from "next/navigation";
import { StepFormRenderer } from "@/components/forms-runtime/step-form-renderer";
import type { FormField } from "@/domain/forms/schema";
import type { LibraryRefOption } from "@/domain/forms/library-refs";
import { submitFormAction } from "./actions";

export function FillFormClient({
  locale,
  assignmentId,
  fields,
  coachName,
  formName,
  previousAnswers,
  uploadContext,
  exerciseOptions,
  foodOptions,
}: {
  locale: string;
  assignmentId: string;
  fields: FormField[];
  coachName: string;
  formName: string;
  previousAnswers?: Record<string, unknown> | null;
  uploadContext: { coachId: string; clientId: string };
  exerciseOptions?: LibraryRefOption[];
  foodOptions?: LibraryRefOption[];
}) {
  const router = useRouter();

  return (
    <StepFormRenderer
      fields={fields}
      coachName={coachName}
      formName={formName}
      previousAnswers={previousAnswers}
      uploadContext={uploadContext}
      exerciseOptions={exerciseOptions}
      foodOptions={foodOptions}
      onSubmit={(answers) => submitFormAction(locale, assignmentId, fields, answers)}
      onDone={() => router.push(`/${locale}/c/forms`)}
    />
  );
}
