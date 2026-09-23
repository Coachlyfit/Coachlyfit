"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { updateClientSchema, type UpdateClientInput } from "../schemas";
import { updateClientAction } from "../actions";

export function EditClientDialog({
  locale,
  clientId,
  client,
  open,
  onOpenChange,
}: {
  locale: string;
  clientId: string;
  client: { display_name: string; email: string | null; phone: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("clients.profile.editDialog");
  const tErrors = useTranslations("clients.errors");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateClientInput>({
    resolver: zodResolver(updateClientSchema),
    defaultValues: {
      displayName: client.display_name,
      email: client.email ?? "",
      phone: client.phone ?? "",
    },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("displayName", data.displayName);
    if (data.email) formData.set("email", data.email);
    if (data.phone) formData.set("phone", data.phone);
    startTransition(async () => {
      const result = await updateClientAction(locale, clientId, formData);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      onOpenChange(false);
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-4" aria-hidden="true" />
            {t("title")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">{t("name")}</Label>
            <Input id="displayName" {...register("displayName")} />
            {errors.displayName && <p className="text-sm text-destructive">{errors.displayName.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" type="email" dir="ltr" {...register("email")} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">{t("phone")}</Label>
            <Input id="phone" type="tel" dir="ltr" {...register("phone")} />
            {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
          </div>
          {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}
          <Button type="submit" disabled={pending} className="min-w-24">
            {pending ? tCommon("pending") : t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
