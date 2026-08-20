"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { assignFormSchema, type AssignFormInput } from "../schemas";
import { assignTemplateAction } from "../actions";

export function AssignDialog({
  locale,
  templateVersionId,
  clients,
  disabled,
}: {
  locale: string;
  templateVersionId: string | null;
  clients: { id: string; display_name: string }[];
  disabled?: boolean;
}) {
  const t = useTranslations("forms.assign");
  const tErrors = useTranslations("forms.errors");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<AssignFormInput>({ resolver: zodResolver(assignFormSchema) });

  const onSubmit = handleSubmit((data) => {
    if (!templateVersionId) return;
    setFormError(null);
    const formData = new FormData();
    formData.set("clientId", data.clientId);
    if (data.dueAt) formData.set("dueAt", data.dueAt);
    startTransition(async () => {
      const result = await assignTemplateAction(locale, templateVersionId, formData);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      reset();
      setOpen(false);
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" disabled={disabled || !templateVersionId} />}>
        <Send className="size-4" />
        {t("title")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="clientId">{t("client")}</Label>
            <Controller
              name="clientId"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="clientId">
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
            {errors.clientId && <p className="text-sm text-destructive">{errors.clientId.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dueAt">{t("dueAt")}</Label>
            <Input id="dueAt" type="date" {...register("dueAt")} />
          </div>
          {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}
          <Button type="submit" disabled={pending}>
            {t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
