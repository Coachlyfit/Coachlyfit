"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { FormDatePicker } from "@/components/date-picker";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Link } from "@/i18n/navigation";
import { assignFormSchema, type AssignFormInput } from "../forms/schemas";
import { assignTemplateAction } from "../forms/actions";

/** Sends the coach's default check-in form (Settings -> automatic check-in)
 * to one client. Same action and schema as the per-template AssignDialog;
 * the only difference is that the template is already chosen. */
export function SendCheckinDialog({
  locale,
  templateVersionId,
  clients,
}: {
  locale: string;
  /** null when no default check-in template is set, or it was never published. */
  templateVersionId: string | null;
  clients: { id: string; display_name: string }[];
}) {
  const t = useTranslations("dashboard.sendCheckin");
  const tAssign = useTranslations("forms.assign");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const {
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<AssignFormInput>({ resolver: zodResolver(assignFormSchema), defaultValues: { clientId: "" } });

  const onSubmit = handleSubmit((data) => {
    if (!templateVersionId) return;
    const formData = new FormData();
    formData.set("clientId", data.clientId);
    if (data.dueAt) formData.set("dueAt", data.dueAt);
    startTransition(async () => {
      try {
        const result = await assignTemplateAction(locale, templateVersionId, formData);
        if (result?.error) {
          toast.error(t("failed"));
          return;
        }
      } catch {
        toast.error(t("failed"));
        return;
      }
      toast.success(t("sent"));
      reset();
      setOpen(false);
    });
  });

  const setupMessage = !templateVersionId ? t("noTemplate") : clients.length === 0 ? t("noClients") : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="secondary" />}>
        <Send className="size-4" aria-hidden="true" />
        {t("title")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{setupMessage ?? t("description")}</DialogDescription>
        </DialogHeader>

        {setupMessage ? (
          <Link
            href={templateVersionId ? "/clients" : "/settings"}
            className={buttonVariants({ variant: "outline" })}
          >
            {templateVersionId ? t("goToClients") : t("goToSettings")}
          </Link>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="checkinClientId">{tAssign("client")}</Label>
              <Controller
                name="clientId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    items={clients.map((c) => ({ value: c.id, label: c.display_name }))}
                  >
                    <SelectTrigger id="checkinClientId" aria-invalid={!!errors.clientId}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.clientId && <p className="text-sm text-destructive">{t("pickClient")}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="checkinDueAt">{tAssign("dueAt")}</Label>
              <FormDatePicker id="checkinDueAt" control={control} name="dueAt" />
            </div>
            <Button type="submit" disabled={pending} className="min-w-24">
              {pending ? tCommon("pending") : t("submit")}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
