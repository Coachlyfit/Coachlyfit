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
import { ProofUploadField } from "@/components/finance/proof-upload-field";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { recordTransactionSchema, type RecordTransactionFormInput } from "@/app/[locale]/(coach)/clients/schemas";
import { recordTransactionAction } from "@/app/[locale]/(coach)/clients/actions";

export function RecordTransactionDialog({
  locale,
  coachId,
  clientId,
  subscriptionId,
  paymentMethods,
}: {
  locale: string;
  coachId: string;
  clientId: string;
  subscriptionId: string;
  paymentMethods: { id: string; name_ar: string; name_en: string }[];
}) {
  const t = useTranslations("clients.billing.recordTransaction");
  const tErrors = useTranslations("clients.billing.errors");
  const tCommon = useTranslations("common");
  const displayLocale = useLocale() as AppLocale;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [proofPath, setProofPath] = useState<string | null>(null);

  const {
    handleSubmit,
    control,
    register,
    formState: { errors },
  } = useForm<RecordTransactionFormInput>({
    resolver: zodResolver(recordTransactionSchema),
    // payment_method_id starts defined (not undefined) so the Select is
    // controlled from the first render — same reasoning as
    // start-subscription-dialog.tsx's package_id default.
    defaultValues: { subscription_id: subscriptionId, payment_method_id: "" },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("subscription_id", data.subscription_id);
    formData.set("payment_method_id", data.payment_method_id);
    formData.set("amount_egp", String(data.amount_egp));
    if (data.transaction_date) formData.set("transaction_date", data.transaction_date);
    if (proofPath) formData.set("proof_path", proofPath);

    startTransition(async () => {
      const result = await recordTransactionAction(locale, clientId, formData);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      setOpen(false);
      setProofPath(null);
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" disabled={paymentMethods.length === 0} />}>
        <Plus className="size-4" />
        {t("title")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="amount_egp">{t("amount")}</Label>
            <Input id="amount_egp" type="number" min={0} step="0.01" {...register("amount_egp")} />
            {errors.amount_egp && <p className="text-sm text-destructive">{errors.amount_egp.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="payment_method_id">{t("method")}</Label>
            <Controller
              name="payment_method_id"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => v !== null && field.onChange(v)}>
                  <SelectTrigger id="payment_method_id">
                    <SelectValue>
                      {(v: string) => pickLocale(paymentMethods.find((m) => m.id === v) ?? {}, displayLocale)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((method) => (
                      <SelectItem key={method.id} value={method.id}>
                        {pickLocale(method, displayLocale)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.payment_method_id && (
              <p className="text-sm text-destructive">{errors.payment_method_id.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="transaction_date">{t("date")}</Label>
            <FormDatePicker id="transaction_date" control={control} name="transaction_date" />
          </div>
          <ProofUploadField
            coachId={coachId}
            clientId={clientId}
            path={proofPath}
            onPathChange={setProofPath}
            onUploadingChange={setUploading}
          />
          {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}
          <Button type="submit" disabled={pending || uploading} className="min-w-24">
            {pending ? tCommon("pending") : t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
