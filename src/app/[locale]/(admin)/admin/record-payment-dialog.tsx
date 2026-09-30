"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormDatePicker } from "@/components/date-picker";
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
import { recordPaymentSchema, type RecordPaymentFormInput, type RecordPaymentInput } from "./schemas";
import { recordPaymentAction } from "./actions";

const METHODS = ["instapay", "bank_transfer", "vodafone_cash", "cash"] as const;

export function RecordPaymentDialog({ locale, coachId }: { locale: string; coachId: string }) {
  const t = useTranslations("admin.coaches.recordPaymentDialog");
  const tMethods = useTranslations("admin.coaches.methods");
  const tErrors = useTranslations("admin.coaches.errors");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<RecordPaymentFormInput, unknown, RecordPaymentInput>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: {
      coachId,
      method: "instapay",
      periodStart: today,
      periodEnd: nextMonth.toISOString().slice(0, 10),
    },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("coachId", data.coachId);
    formData.set("amountEgp", String(data.amountEgp));
    formData.set("method", data.method);
    if (data.reference) formData.set("reference", data.reference);
    formData.set("periodStart", data.periodStart);
    formData.set("periodEnd", data.periodEnd);
    startTransition(async () => {
      const result = await recordPaymentAction(locale, formData);
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
        <Wallet className="size-4" />
        {t("title")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="amountEgp">{t("amount")}</Label>
              <Input id="amountEgp" type="number" step="1" {...register("amountEgp")} />
              {errors.amountEgp && (
                <p className="text-sm text-destructive">{errors.amountEgp.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="method">{t("method")}</Label>
              <Controller
                name="method"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    items={METHODS.map((m) => ({ value: m, label: tMethods(m) }))}
                  >
                    <SelectTrigger id="method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {tMethods(m)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reference">{t("reference")}</Label>
            <Input id="reference" {...register("reference")} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="periodStart">{t("periodStart")}</Label>
              <FormDatePicker id="periodStart" control={control} name="periodStart" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="periodEnd">{t("periodEnd")}</Label>
              <FormDatePicker id="periodEnd" control={control} name="periodEnd" />
            </div>
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
