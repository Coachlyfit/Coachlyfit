"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { submitFeedbackAction } from "@/app/[locale]/(coach)/feedback-actions";

// Always-present, secondary affordance -- floating above the mobile bottom
// nav (bottom-20, which clears BottomNav's own fixed bar) and closer to the
// corner on desktop (md:bottom-4). Toast-only success, same reasoning as
// BroadcastDialog: there's no visible list for a coach to see their own
// submission land in (feedback is write-only for them, see the migration).
export function FeedbackWidget() {
  const t = useTranslations("feedback");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("feedback.errors");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const { register, handleSubmit, reset } = useForm<{ body: string }>();

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    startTransition(async () => {
      const result = await submitFeedbackAction(data.body);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      reset();
      setOpen(false);
      toast.success(t("success"));
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label={t("trigger")}
            className="fixed bottom-20 end-4 z-40 rounded-full shadow-lg md:bottom-4"
          />
        }
      >
        <MessageSquarePlus className="size-5" aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Textarea {...register("body")} placeholder={t("placeholder")} rows={4} autoFocus />
          {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}
          <Button type="submit" disabled={pending} className="min-w-24">
            {pending ? tCommon("pending") : t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
