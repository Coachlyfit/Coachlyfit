"use client";

import { Controller, type UseFormReturn } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INVOICE_CURRENCIES, type InvoiceCurrency } from "@/domain/billing/invoices";
import type { BusinessProfileFormInput } from "@/app/[locale]/(coach)/settings/business-profile-schema";

/** Billing tab: invoice defaults. Shares one form with IdentityFields. */
export function BillingFields({ form }: { form: UseFormReturn<BusinessProfileFormInput> }) {
  const t = useTranslations("settings.businessProfile");
  const tCurrencyName = useTranslations("invoices.currencyName");
  const {
    register,
    control,
    formState: { errors },
  } = form;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bp_currency">{t("defaultCurrency")}</Label>
        <Controller
          name="default_currency"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={(v) => v !== null && field.onChange(v)}>
              <SelectTrigger
                id="bp_currency"
                className="w-full text-base data-[size=default]:h-11 md:text-sm md:data-[size=default]:h-10"
              >
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bp_tax_rate">{t("defaultTaxRate")}</Label>
        <Input
          id="bp_tax_rate"
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step="0.01"
          className="h-11 font-mono tabular-nums md:h-10"
          aria-invalid={!!errors.default_tax_rate}
          {...register("default_tax_rate")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bp_tax_number">{t("taxNumber")}</Label>
        <Input id="bp_tax_number" dir="ltr" className="h-11 font-mono md:h-10" {...register("tax_number")} />
      </div>
    </>
  );
}
