"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations, useLocale } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormDatePicker } from "@/components/date-picker";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { createSubscriptionSchema, type CreateSubscriptionInput } from "@/app/[locale]/(coach)/clients/schemas";
import { createSubscriptionAction } from "@/app/[locale]/(coach)/clients/actions";

export function StartSubscriptionDialog({
  locale,
  clientId,
  packages,
}: {
  locale: string;
  clientId: string;
  packages: { id: string; name_ar: string; name_en: string; duration_days: number; price_egp: number }[];
}) {
  const t = useTranslations("clients.billing.startSubscription");
  const tErrors = useTranslations("clients.billing.errors");
  const tCommon = useTranslations("common");
  const displayLocale = useLocale() as AppLocale;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    handleSubmit,
    control,
    register,
    setValue,
    formState: { errors },
  } = useForm<CreateSubscriptionInput>({
    resolver: zodResolver(createSubscriptionSchema),
    // package_id starts defined (not undefined) so the Select is controlled
    // from the first render — same reasoning as create-program-dialog.tsx's
    // `defaultValues: { client_id: "" }`.
    defaultValues: { package_id: "", end_date: "" },
  });

  // Pre-fills end_date as start_date (today) + the picked package's
  // duration — a coach can still adjust it, this just saves the arithmetic
  // for the common case of "starts today, runs the package's full length".
  function onPackageChange(packageId: string) {
    const pkg = packages.find((p) => p.id === packageId);
    if (!pkg) return;
    const end = new Date();
    end.setDate(end.getDate() + pkg.duration_days);
    setValue("end_date", end.toISOString().slice(0, 10), { shouldValidate: true });
  }

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("package_id", data.package_id);
    formData.set("end_date", data.end_date);
    startTransition(async () => {
      const result = await createSubscriptionAction(locale, clientId, formData);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      setOpen(false);
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" disabled={packages.length === 0} />}>
        <Plus className="size-4" />
        {t("title")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="package_id">{t("package")}</Label>
            <Controller
              name="package_id"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => {
                    if (v === null) return;
                    field.onChange(v);
                    onPackageChange(v);
                  }}
                >
                  <SelectTrigger id="package_id">
                    <SelectValue>
                      {(v: string) => pickLocale(packages.find((p) => p.id === v) ?? {}, displayLocale)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {packages.map((pkg) => (
                      <SelectItem key={pkg.id} value={pkg.id}>
                        {pickLocale(pkg, displayLocale)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.package_id && <p className="text-sm text-destructive">{errors.package_id.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="end_date">{t("endDate")}</Label>
            <FormDatePicker id="end_date" control={control} name="end_date" />
            {errors.end_date && <p className="text-sm text-destructive">{errors.end_date.message}</p>}
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
