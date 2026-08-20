"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
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
import { FORM_KINDS } from "@/domain/forms/schema";
import { createTemplateSchema, type CreateTemplateInput } from "./schemas";
import { createTemplateAction } from "./actions";

export function CreateTemplateDialog({ locale }: { locale: string }) {
  const t = useTranslations("forms.createDialog");
  const tForms = useTranslations("forms");
  const tKinds = useTranslations("forms.kinds");
  const tErrors = useTranslations("forms.errors");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CreateTemplateInput>({
    resolver: zodResolver(createTemplateSchema),
    defaultValues: { kind: "custom" },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("kind", data.kind);
    formData.set("name_ar", data.name_ar);
    formData.set("name_en", data.name_en);
    startTransition(async () => {
      const result = await createTemplateAction(locale, formData);
      if (result?.error) setFormError(result.error);
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" />
        {tForms("newTemplate")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name_ar">{t("nameAr")}</Label>
            <Input id="name_ar" dir="rtl" {...register("name_ar")} />
            {errors.name_ar && <p className="text-sm text-destructive">{errors.name_ar.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name_en">{t("nameEn")}</Label>
            <Input id="name_en" dir="ltr" {...register("name_en")} />
            {errors.name_en && <p className="text-sm text-destructive">{errors.name_en.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="kind">{t("kind")}</Label>
            <Controller
              name="kind"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORM_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {tKinds(kind)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
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
