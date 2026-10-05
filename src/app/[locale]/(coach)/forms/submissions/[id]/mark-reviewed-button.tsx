"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markSubmissionReviewedAction } from "../../actions";

export function MarkReviewedButton({ locale, submissionId }: { locale: string; submissionId: string }) {
  const t = useTranslations("forms.submissions");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("forms.errors");
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await markSubmissionReviewedAction(locale, submissionId);
      if (result?.error) toast.error(tErrors(result.error));
    });
  }

  return (
    <Button type="button" size="sm" disabled={pending} onClick={onClick}>
      <Check className="size-4" aria-hidden="true" />
      {pending ? tCommon("pending") : t("markReviewed")}
    </Button>
  );
}
