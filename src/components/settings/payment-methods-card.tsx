"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="max-w-md">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
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
      </CardHeader>
      <CardContent>
        {methods.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {methods.map((method) => (
              <li key={method.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{pickLocale(method, locale)}</span>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setPendingDelete(method.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={t("confirmDeleteTitle")}
        confirmLabel={t("delete")}
        onConfirm={confirmDelete}
        pending={pending}
      />
    </Card>
  );
}
