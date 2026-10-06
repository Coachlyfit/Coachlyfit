"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { createPaymentMethodAction, deletePaymentMethodAction } from "@/app/[locale]/(coach)/settings/billing-actions";

const methodFormSchema = z.object({
  name_ar: z.string().min(1).max(60),
  name_en: z.string().min(1).max(60),
});
type MethodFormInput = z.input<typeof methodFormSchema>;

type PaymentMethod = { id: string; name_ar: string; name_en: string };

export function PaymentMethodsCard({ methods }: { methods: PaymentMethod[] }) {
  const t = useTranslations("settings.paymentMethods");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("settings.errors");
  const locale = useLocale() as AppLocale;
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MethodFormInput>({ resolver: zodResolver(methodFormSchema) });

  const onSubmit = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("name_ar", data.name_ar);
    formData.set("name_en", data.name_en);
    startTransition(async () => {
      const result = await createPaymentMethodAction(locale, formData);
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      reset();
      setOpen(false);
    });
  });

  function confirmDelete() {
    if (!pendingDelete) return;
    startTransition(async () => {
      const result = await deletePaymentMethodAction(locale, pendingDelete);
      if (result?.error) toast.error(tErrors(result.error));
      setPendingDelete(null);
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{t("title")}</h3>
      {methods.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      <div className="flex flex-wrap gap-2">
        {methods.map((method) => (
          <span
            key={method.id}
            className="flex h-10 max-w-full items-center gap-1 rounded-full bg-muted ps-3.5 pe-1 text-sm font-medium"
          >
            <span className="min-w-0 truncate">{pickLocale(method, locale)}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0 rounded-full"
              aria-label={`${t("delete")}: ${pickLocale(method, locale)}`}
              onClick={() => setPendingDelete(method.id)}
            >
              <X className="size-3.5" />
            </Button>
          </span>
        ))}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={<Button type="button" variant="outline" size="sm" className="rounded-full border-dashed" />}
          >
            <Plus className="size-4" />
            {t("add")}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("add")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pm_name_ar">{t("nameAr")}</Label>
                <Input id="pm_name_ar" dir="rtl" {...register("name_ar")} />
                {errors.name_ar && <p className="text-sm text-destructive">{errors.name_ar.message}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pm_name_en">{t("nameEn")}</Label>
                <Input id="pm_name_en" dir="ltr" {...register("name_en")} />
                {errors.name_en && <p className="text-sm text-destructive">{errors.name_en.message}</p>}
              </div>
              <Button type="submit" disabled={pending} className="min-w-24">
                {pending ? tCommon("pending") : t("submit")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={t("confirmDeleteTitle")}
        confirmLabel={t("delete")}
        onConfirm={confirmDelete}
        pending={pending}
      />
    </section>
  );
}
