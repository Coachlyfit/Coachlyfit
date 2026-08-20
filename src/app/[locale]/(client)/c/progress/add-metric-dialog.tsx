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
import { pickLocale, type AppLocale } from "@/domain/locale";
import {
  bodyMetricSchema,
  METRIC_PRESETS,
  METRIC_PRESET_UNIT,
  type BodyMetricFormInput,
  type BodyMetricInput,
} from "./metric-schemas";
import { addBodyMetricAction } from "./actions";

type CustomMetric = { key: string; label_ar: string; label_en: string; unit: string };

export function AddMetricDialog({ locale, customMetrics = [] }: { locale: string; customMetrics?: CustomMetric[] }) {
  const t = useTranslations("progress.metrics");
  const tErrors = useTranslations("progress.errors");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const unitByKey: Record<string, string> = {
    ...METRIC_PRESET_UNIT,
    ...Object.fromEntries(customMetrics.map((m) => [m.key, m.unit])),
  };
  const labelByKey: Record<string, string> = Object.fromEntries(
    customMetrics.map((m) => [m.key, pickLocale(m, locale as AppLocale, "label")])
  );

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<BodyMetricFormInput, unknown, BodyMetricInput>({
    resolver: zodResolver(bodyMetricSchema),
    defaultValues: {
      taken_on: new Date().toISOString().slice(0, 10),
      metric: METRIC_PRESETS[0],
      unit: METRIC_PRESET_UNIT[METRIC_PRESETS[0]],
    },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("taken_on", data.taken_on);
    formData.set("metric", data.metric);
    formData.set("value", String(data.value));
    formData.set("unit", data.unit);
    startTransition(async () => {
      const result = await addBodyMetricAction(locale, formData);
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
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Plus className="size-4" />
        {t("add")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("add")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="metric">{t("metric")}</Label>
            <Controller
              name="metric"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                    if (typeof value === "string" && value in unitByKey) {
                      setValue("unit", unitByKey[value]);
                    }
                  }}
                >
                  <SelectTrigger id="metric">
                    <SelectValue>
                      {(value) =>
                        typeof value === "string" && value in METRIC_PRESET_UNIT
                          ? t(`presets.${value}`)
                          : (labelByKey[value as string] ?? value)
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {METRIC_PRESETS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {t(`presets.${m}`)}
                      </SelectItem>
                    ))}
                    {customMetrics.map((m) => (
                      <SelectItem key={m.key} value={m.key}>
                        {labelByKey[m.key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="value">{t("value")}</Label>
              <Input id="value" type="number" step="0.1" {...register("value")} />
              {errors.value && <p className="text-sm text-destructive">{errors.value.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="unit">{t("unit")}</Label>
              <Input id="unit" {...register("unit")} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="taken_on">{t("takenOn")}</Label>
            <Input id="taken_on" type="date" {...register("taken_on")} />
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
