"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { COACH_LOGOS_BUCKET } from "@/domain/billing/invoices.service";
import { INVOICE_CURRENCIES, type InvoiceCurrency } from "@/domain/billing/invoices";
import {
  businessProfileSchema,
  type BusinessProfileFormInput,
} from "@/app/[locale]/(coach)/settings/business-profile-schema";
import { updateBusinessProfileAction } from "@/app/[locale]/(coach)/settings/actions";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
// No SVG: the bucket is public, and an SVG opened directly (not via <img>)
// can run script on the storage origin.
const LOGO_EXT = new Set(["png", "jpg", "jpeg", "webp"]);

export function BusinessProfileCard({
  coachId,
  defaultValues,
  logoUrl: initialLogoUrl,
}: {
  coachId: string;
  defaultValues: BusinessProfileFormInput;
  logoUrl: string | null;
}) {
  const t = useTranslations("settings.businessProfile");
  const tErrors = useTranslations("settings.errors");
  const tCurrencyName = useTranslations("invoices.currencyName");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState(initialLogoUrl);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<BusinessProfileFormInput>({ resolver: zodResolver(businessProfileSchema), defaultValues });

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (file.size > MAX_LOGO_BYTES || !LOGO_EXT.has(ext)) {
      toast.error(tErrors("invalid_file"));
      return;
    }

    // A fresh path per upload (no upsert) -- the public URL is cached, so
    // overwriting in place would keep showing the old logo.
    const path = `${coachId}/${crypto.randomUUID()}.${ext}`;
    const supabase = createClient();
    setUploading(true);
    const { error } = await supabase.storage.from(COACH_LOGOS_BUCKET).upload(path, file);
    setUploading(false);
    if (error) {
      toast.error(tErrors("upload_failed"));
      return;
    }
    setValue("logo_path", path, { shouldDirty: true });
    setLogoPreview(supabase.storage.from(COACH_LOGOS_BUCKET).getPublicUrl(path).data.publicUrl);
  }

  function removeLogo() {
    setValue("logo_path", null, { shouldDirty: true });
    setLogoPreview(null);
  }

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await updateBusinessProfileAction(locale, data);
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      toast.success(t("saved"));
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label>{t("logo")}</Label>
            <div className="flex items-center gap-3">
              {logoPreview && (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded public storage URL.
                <img src={logoPreview} alt="" className="h-12 w-auto max-w-40 rounded bg-white object-contain p-1 ring-1 ring-border" />
              )}
              <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground hover:bg-muted">
                <Upload className="size-4" />
                {uploading ? t("uploading") : t("uploadLogo")}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleLogoChange}
                  disabled={uploading}
                />
              </label>
              {logoPreview && (
                <Button type="button" variant="ghost" size="sm" onClick={removeLogo}>
                  {t("removeLogo")}
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="bp_business_name">{t("businessName")}</Label>
            <Input id="bp_business_name" aria-invalid={!!errors.business_name} {...register("business_name")} />
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="bp_address">{t("address")}</Label>
            <Textarea id="bp_address" rows={2} {...register("address")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="bp_phone">{t("contactPhone")}</Label>
            <Input id="bp_phone" type="tel" dir="ltr" {...register("contact_phone")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="bp_email">{t("contactEmail")}</Label>
            <Input id="bp_email" type="email" dir="ltr" aria-invalid={!!errors.contact_email} {...register("contact_email")} />
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="bp_tax_number">{t("taxNumber")}</Label>
            <Input id="bp_tax_number" dir="ltr" {...register("tax_number")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="bp_currency">{t("defaultCurrency")}</Label>
            <Controller
              name="default_currency"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => v !== null && field.onChange(v)}>
                  <SelectTrigger id="bp_currency" className="w-full">
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
            <Label htmlFor="bp_tax_rate">{t("defaultTaxRate")}</Label>
            <Input
              id="bp_tax_rate"
              type="number"
              min={0}
              max={100}
              step="0.01"
              aria-invalid={!!errors.default_tax_rate}
              {...register("default_tax_rate")}
            />
          </div>

          {Object.keys(errors).length > 0 && (
            <p className="text-sm text-destructive sm:col-span-2">{tErrors("invalid_input")}</p>
          )}

          <Button type="submit" disabled={pending || uploading} className="w-fit min-w-32">
            {pending ? tCommon("pending") : t("save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
