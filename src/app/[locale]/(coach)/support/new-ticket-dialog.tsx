"use client";

import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentPicker, type PickedAttachment } from "@/components/support/attachment-picker";
import { BODY_MAX, SUBJECT_MAX, TICKET_CATEGORIES, attachmentFolder } from "@/domain/support/support";
import { useRouter } from "@/i18n/navigation";
import { createTicketAction } from "./actions";
import { ticketFormSchema, type TicketFormInput } from "./schemas";

const FIELD = "h-11 md:h-10";

/** The "New ticket" button and its form. The form is only mounted while the
 * dialog is open, so each opening starts clean with fresh ids. */
export function NewTicketDialog({ locale, coachId }: { locale: string; coachId: string }) {
  const t = useTranslations("support");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        {t("new")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("form.title")}</DialogTitle>
          </DialogHeader>
          {open && <NewTicketForm locale={locale} coachId={coachId} onClose={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function NewTicketForm({ locale, coachId, onClose }: { locale: string; coachId: string; onClose: () => void }) {
  const t = useTranslations("support.form");
  const tCategory = useTranslations("support.category");
  const tErrors = useTranslations("support.errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Fixed for the life of the form: the images are uploaded under these ids
  // before the ticket exists.
  const [ids] = useState(() => ({ id: crypto.randomUUID(), messageId: crypto.randomUUID() }));
  const [attachments, setAttachments] = useState<PickedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<TicketFormInput>({
    resolver: zodResolver(ticketFormSchema),
    defaultValues: { subject: "", category: "technical", body: "" },
  });

  const categories = TICKET_CATEGORIES.map((value) => ({ value, label: tCategory(value) }));

  function onSubmit(values: TicketFormInput) {
    startTransition(async () => {
      const result = await createTicketAction(locale, {
        ...values,
        ...ids,
        attachmentPaths: attachments.map((item) => item.path),
      });
      if (result?.error) {
        toast.error(tErrors.has(result.error) ? tErrors(result.error) : tErrors("send_failed"));
        return;
      }
      toast.success(t("created"));
      onClose();
      router.push(`/support/${ids.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ticket-subject">{t("subject")}</Label>
        <Input
          id="ticket-subject"
          className={FIELD}
          maxLength={SUBJECT_MAX}
          placeholder={t("subjectPlaceholder")}
          aria-invalid={!!errors.subject}
          autoFocus
          {...register("subject")}
        />
        {errors.subject && <p className="text-xs text-destructive">{t("subjectInvalid")}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ticket-category">{t("category")}</Label>
        <Controller
          name="category"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} items={categories}>
              <SelectTrigger id="ticket-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ticket-body">{t("description")}</Label>
        <Textarea
          id="ticket-body"
          rows={5}
          maxLength={BODY_MAX}
          placeholder={t("descriptionPlaceholder")}
          aria-invalid={!!errors.body}
          dir="auto"
          {...register("body")}
        />
        {errors.body && <p className="text-xs text-destructive">{t("descriptionRequired")}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t("attachments")}</Label>
        <AttachmentPicker
          folder={attachmentFolder(coachId, ids.id, ids.messageId)}
          value={attachments}
          onChange={setAttachments}
          onUploadingChange={setUploading}
          disabled={pending}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={pending || uploading} className="min-w-24">
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
