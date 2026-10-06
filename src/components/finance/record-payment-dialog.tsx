"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormDatePicker } from "@/components/date-picker";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { InvoiceCurrency } from "@/domain/billing/invoices";
import { recordPaymentSchema, type RecordPaymentInput } from "@/app/[locale]/(coach)/invoices/schemas";
import { recordInvoicePaymentAction } from "@/app/[locale]/(coach)/invoices/actions";
import { ProofUploadField } from "./proof-upload-field";

export type PayableInvoice = {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  total: number;
  currency: InvoiceCurrency;
};

export type PaymentMethodOption = { id: string; name_ar: string; name_en: string };

type Props = {
  coachId: string;
  /** Issued invoices with no payment behind them yet. */
  invoices: PayableInvoice[];
  paymentMethods: PaymentMethodOption[];
  /** Opened from an invoice's own row: the picker is replaced by its summary. */
  invoiceId?: string;
};

/** Records a payment against an issued invoice: the invoice becomes paid and
 * the payment shows up in the payments list, in one step
 * (record_invoice_payment). Always the full invoice amount. */
export function RecordPaymentDialog({
  open,
  onOpenChange,
  ...props
}: Props & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("finance.payDialog");
  const blocked = props.paymentMethods.length === 0 ? "noMethods" : props.invoices.length === 0 ? "noUnpaid" : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          {blocked && <DialogDescription>{t(blocked)}</DialogDescription>}
        </DialogHeader>
        {blocked === "noMethods" && (
          <Link href="/settings" className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline">
            {t("addMethods")}
          </Link>
        )}
        {/* Mounted only while open, so every opening starts from a clean form. */}
        {open && !blocked && <PaymentForm {...props} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({ coachId, invoices, paymentMethods, invoiceId, onDone }: Props & { onDone: () => void }) {
  const t = useTranslations("finance.payDialog");
  const tInvoices = useTranslations("invoices");
  const tCommon = useTranslations("common");
  const locale = useLocale() as AppLocale;
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [proofPath, setProofPath] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RecordPaymentInput>({
    resolver: zodResolver(recordPaymentSchema),
    // Both selects start defined so they are controlled from the first render.
    defaultValues: { invoice_id: invoiceId ?? "", payment_method_id: "", paid_on: "" },
  });

  const selectedId = useWatch({ control, name: "invoice_id" });
  const invoice = invoices.find((i) => i.id === selectedId);
  const label = (i: PayableInvoice) =>
    `${i.number} · ${i.clientName} · ${formatNumber(i.total, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${tInvoices(`currency.${i.currency}`)}`;

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    startTransition(async () => {
      const result = await recordInvoicePaymentAction(locale, { ...data, proof_path: proofPath ?? "" });
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      toast.success(t("recorded"));
      onDone();
    });
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="pay_invoice_id">{t("invoice")}</Label>
        {invoiceId ? (
          <p className="font-mono text-sm tabular-nums">{invoice ? label(invoice) : ""}</p>
        ) : (
          <Controller
            name="invoice_id"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  if (v === null) return;
                  field.onChange(v);
                  // The proof path is scoped to the invoice's client.
                  setProofPath(null);
                }}
              >
                <SelectTrigger id="pay_invoice_id" className="w-full">
                  <SelectValue placeholder={t("invoicePlaceholder")}>
                    {(v: string) => {
                      const picked = invoices.find((i) => i.id === v);
                      return picked ? label(picked) : t("invoicePlaceholder");
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {invoices.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {label(i)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        )}
        {errors.invoice_id && <p className="text-sm text-destructive">{t("invoiceRequired")}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="pay_method_id">{t("method")}</Label>
        <Controller
          name="payment_method_id"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={(v) => v !== null && field.onChange(v)}>
              <SelectTrigger id="pay_method_id" className="w-full">
                <SelectValue>
                  {(v: string) => pickLocale(paymentMethods.find((m) => m.id === v) ?? {}, locale)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {paymentMethods.map((method) => (
                  <SelectItem key={method.id} value={method.id}>
                    {pickLocale(method, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.payment_method_id && <p className="text-sm text-destructive">{t("methodRequired")}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="pay_paid_on">{t("date")}</Label>
        <FormDatePicker id="pay_paid_on" control={control} name="paid_on" />
      </div>
      {invoice && (
        <ProofUploadField
          coachId={coachId}
          clientId={invoice.clientId}
          path={proofPath}
          onPathChange={setProofPath}
          onUploadingChange={setUploading}
        />
      )}
      {formError && <p className="text-sm text-destructive">{tInvoices(`errors.${formError}`)}</p>}
      <Button type="submit" disabled={pending || uploading} className="min-w-24">
        {pending ? tCommon("pending") : t("submit")}
      </Button>
    </form>
  );
}

/** The page-level "record payment" button: opens the dialog with the
 * invoice picker. */
export function RecordPaymentButton({ className, ...props }: Omit<Props, "invoiceId"> & { className?: string }) {
  const t = useTranslations("finance");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" className={className} onClick={() => setOpen(true)}>
        {t("recordPayment")}
      </Button>
      <RecordPaymentDialog open={open} onOpenChange={setOpen} {...props} />
    </>
  );
}
