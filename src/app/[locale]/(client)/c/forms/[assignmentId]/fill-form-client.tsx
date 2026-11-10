"use client";

import { useRouter } from "@/i18n/navigation";
import { FillForm, type FillFormProps } from "@/components/forms-runtime/fill-form";
import { saveDraftAction, submitFormAction } from "./actions";

type Props = Omit<FillFormProps, "onSaveDraft" | "onSubmit" | "onDone"> & {
  locale: string;
  assignmentId: string;
};

/** Binds the server actions to one assignment. The fields never travel to the
 * actions: they re-read the pinned template server-side. */
export function FillFormClient({ locale, assignmentId, ...props }: Props) {
  const router = useRouter();
  return (
    <FillForm
      {...props}
      onSaveDraft={(answers, fieldId) => saveDraftAction(assignmentId, answers, fieldId)}
      onSubmit={(answers) => submitFormAction(locale, assignmentId, answers)}
      onDone={() => router.push("/c/forms")}
    />
  );
}
