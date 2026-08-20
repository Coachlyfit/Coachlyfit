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
import {
  createMetricDefinitionAction,
  deleteMetricDefinitionAction,
} from "@/app/[locale]/(coach)/settings/metrics-actions";

const metricFormSchema = z.object({
  label_ar: z.string().min(1).max(60),
  label_en: z.string().min(1).max(60),
  unit: z.string().min(1).max(20),
});
type MetricFormInput = z.input<typeof metricFormSchema>;

type MetricDefinition = { id: string; label_ar: string; label_en: string; unit: string };

export function CustomMetricsCard({ metrics }: { metrics: MetricDefinition[] }) {
  const t = useTranslations("settings.customMetrics");
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
  } = useForm<MetricFormInput>({ resolver: zodResolver(metricFormSchema) });

  const onSubmit = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("label_ar", data.label_ar);
    formData.set("label_en", data.label_en);
    formData.set("unit", data.unit);
    startTransition(async () => {
      const result = await createMetricDefinitionAction(locale, formData);
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
      const result = await deleteMetricDefinitionAction(locale, pendingDelete);
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
                <Label htmlFor="metric_name_ar">{t("nameAr")}</Label>
                <Input id="metric_name_ar" dir="rtl" {...register("label_ar")} />
                {errors.label_ar && <p className="text-sm text-destructive">{errors.label_ar.message}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="metric_name_en">{t("nameEn")}</Label>
                <Input id="metric_name_en" dir="ltr" {...register("label_en")} />
                {errors.label_en && <p className="text-sm text-destructive">{errors.label_en.message}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="metric_unit">{t("unit")}</Label>
                <Input id="metric_unit" placeholder={t("unitPlaceholder")} {...register("unit")} />
                {errors.unit && <p className="text-sm text-destructive">{errors.unit.message}</p>}
              </div>
              <Button type="submit" disabled={pending}>
                {t("submit")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {metrics.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {metrics.map((metric) => (
              <li key={metric.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {pickLocale(metric, locale, "label")} <span className="text-muted-foreground">({metric.unit})</span>
                </span>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setPendingDelete(metric.id)}>
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
