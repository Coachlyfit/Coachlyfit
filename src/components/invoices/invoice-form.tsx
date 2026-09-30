"use client";

import { useTransition } from "react";
import { useForm, useFieldArray, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calculateTotals, INVOICE_CURRENCIES, type InvoiceCurrency } from "@/domain/billing/invoices";
import type { AppLocale } from "@/domain/locale";
import { formatNumber } from "@/lib/format";
import { invoiceDraftSchema, type InvoiceDraftFormInput } from "@/app/[locale]/(coach)/invoices/schemas";
import { createInvoiceAction, updateDraftAction } from "@/app/[locale]/(coach)/invoices/actions";

const EMPTY_LINE = { description: "", quantity: 1, unit_price: 0 };

/** Create and edit share one form. On edit the client is fixed -- an
 * existing draft may already be linked to that client's payment. */
export function InvoiceForm({
  invoiceId,
  clients,
  defaultValues,
}: {
  invoiceId?: string;
  clients: { id: string; display_name: string }[];
  defaultValues: InvoiceDraftFormInput;
}) {
  const t = useTranslations("invoices.form");
  const tErrors = useTranslations("invoices.errors");
  const tCurrency = useTranslations("invoices.currency");
  const tCurrencyName = useTranslations("invoices.currencyName");
  const tCommon = useTranslations("common");
  const locale = useLocale() as AppLocale;
  const [pending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<InvoiceDraftFormInput>({ resolver: zodResolver(invoiceDraftSchema), defaultValues });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  // Live preview only -- the service recomputes on save, so the stored
  // totals never depend on this client-side math.
  const [items, taxRate, currency] = useWatch({ control, name: ["items", "tax_rate", "currency"] });
  const totals = calculateTotals(
    (items ?? []).map((item) => ({
      description: item.description,
      quantity: Number(item.quantity) || 0,
      unit_price: Number(item.unit_price) || 0,
    })),
    Number(taxRate) || 0
  );
  const money = (value: number) => formatNumber(value, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = invoiceId ? await updateDraftAction(locale, invoiceId, data) : await createInvoiceAction(locale, data);
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      if (invoiceId) toast.success(t("saved"));
    });
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="client_id">{t("client")}</Label>
            <Controller
              name="client_id"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => v !== null && field.onChange(v)} disabled={!!invoiceId}>
                  <SelectTrigger id="client_id" className="w-full">
                    <SelectValue>{(v: string) => clients.find((c) => c.id === v)?.display_name ?? ""}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.client_id && <p className="text-sm text-destructive">{tErrors("invalid_input")}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="currency">{t("currency")}</Label>
            <Controller
              name="currency"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => v !== null && field.onChange(v)}>
                  <SelectTrigger id="currency" className="w-full">
                    <SelectValue>{(v: InvoiceCurrency) => tCurrencyName(v)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {INVOICE_CURRENCIES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {tCurrencyName(code)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="tax_rate">{t("taxRate")}</Label>
            <Input id="tax_rate" type="number" min={0} max={100} step="0.01" {...register("tax_rate")} />
            {errors.tax_rate && <p className="text-sm text-destructive">{tErrors("invalid_input")}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="issue_date">{t("issueDate")}</Label>
            <Input id="issue_date" type="date" {...register("issue_date")} />
            <p className="text-xs text-muted-foreground">{t("issueDateHint")}</p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="due_date">{t("dueDate")}</Label>
            <Input id="due_date" type="date" {...register("due_date")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">{t("items")}</h2>
          {fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_6rem_8rem_auto]">
              <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                <Label htmlFor={`items.${index}.description`} className="sr-only">
                  {t("description")}
                </Label>
                <Input
                  id={`items.${index}.description`}
                  placeholder={t("description")}
                  aria-invalid={!!errors.items?.[index]?.description}
                  {...register(`items.${index}.description`)}
                />
              </div>
              <div className="flex gap-2 sm:contents">
                <div className="flex flex-1 flex-col gap-1">
                  <Label htmlFor={`items.${index}.quantity`} className="sr-only">
                    {t("quantity")}
                  </Label>
                  <Input
                    id={`items.${index}.quantity`}
                    type="number"
                    min={0}
                    step="any"
                    placeholder={t("quantity")}
                    aria-invalid={!!errors.items?.[index]?.quantity}
                    {...register(`items.${index}.quantity`)}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <Label htmlFor={`items.${index}.unit_price`} className="sr-only">
                    {t("unitPrice")}
                  </Label>
                  <Input
                    id={`items.${index}.unit_price`}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={t("unitPrice")}
                    aria-invalid={!!errors.items?.[index]?.unit_price}
                    {...register(`items.${index}.unit_price`)}
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("removeItem")}
                disabled={fields.length === 1}
                onClick={() => remove(index)}
                className="row-start-2 self-center sm:row-start-auto"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {errors.items && <p className="text-sm text-destructive">{tErrors("invalid_input")}</p>}
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => append(EMPTY_LINE)}>
            <Plus className="size-4" />
            {t("addItem")}
          </Button>

          <dl className="ms-auto mt-2 grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t("subtotal")}</dt>
            <dd className="text-end font-mono tabular-nums">{money(totals.subtotal)}</dd>
            <dt className="text-muted-foreground">{t("tax")}</dt>
            <dd className="text-end font-mono tabular-nums">{money(totals.tax)}</dd>
            <dt className="font-semibold">{t("total")}</dt>
            <dd className="text-end font-mono font-semibold tabular-nums">
              {money(totals.total)} <span className="text-xs">{tCurrency(currency)}</span>
            </dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="notes">{t("notes")}</Label>
          <Textarea id="notes" rows={3} {...register("notes")} />
        </CardContent>
      </Card>

      <Button type="submit" disabled={pending} className="w-fit min-w-32">
        {pending ? tCommon("pending") : invoiceId ? t("save") : t("create")}
      </Button>
    </form>
  );
}
