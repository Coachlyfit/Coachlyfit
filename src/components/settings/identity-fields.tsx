"use client";

import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { COACH_LOGOS_BUCKET } from "@/domain/billing/invoices.service";
import { UpgradePrompt } from "@/components/dashboard/upgrade-prompt";
import { AvatarUpload } from "@/components/shared/avatar-upload";
import type { BusinessProfileFormInput } from "@/app/[locale]/(coach)/settings/business-profile-schema";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
// No SVG: the bucket is public, and an SVG opened directly (not via <img>)
// can run script on the storage origin.
const LOGO_EXT = new Set(["png", "jpg", "jpeg", "webp"]);

/** Identity tab: the part of the business profile that brands the invoice
 * header. Shares one form with BillingFields (both save through
 * updateBusinessProfileAction). */
export function IdentityFields({
  form,
  coachId,
  userId,
  avatarUrl,
  logoUrl,
  canSetLogo,
}: {
  form: UseFormReturn<BusinessProfileFormInput>;
  coachId: string;
  /** Signed-in user's id (the avatar owner). */
  userId: string;
  /** Public avatar URL, or null. */
  avatarUrl: string | null;
  logoUrl: string | null;
  canSetLogo: boolean;
}) {
  const t = useTranslations("settings.businessProfile");
  const tErrors = useTranslations("settings.errors");
  const locale = useLocale();
  const [uploading, setUploading] = useState(false);
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = form;
  const initial = (watch("business_name") ?? "").trim().charAt(0).toUpperCase() || "؟";

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
    setUploading(true);
    const { error } = await createClient().storage.from(COACH_LOGOS_BUCKET).upload(path, file);
    setUploading(false);
    if (error) {
      toast.error(tErrors("upload_failed"));
      return;
    }
    setValue("logo_path", path, { shouldDirty: true });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3.5">
        <AvatarUpload
          userId={userId}
          name={(watch("business_name") ?? "").trim() || " Coach"}
          src={avatarUrl}
          size="lg"
          locale={locale}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3.5">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded public storage URL.
          <img src={logoUrl} alt="" className="h-14 w-auto max-w-40 rounded-xl bg-white object-contain p-1 ring-1 ring-border" />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground"
          >
            {initial}
          </span>
        )}
        {canSetLogo ? (
          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-border px-3.5 text-sm font-medium hover:bg-muted md:h-10">
            <Upload className="size-4" />
            {uploading ? t("uploading") : t("uploadLogo")}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={handleLogoChange}
              disabled={uploading}
            />
          </label>
        ) : (
          <UpgradePrompt feature="logo" />
        )}
        {logoUrl && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setValue("logo_path", null, { shouldDirty: true })}>
            {t("removeLogo")}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bp_business_name">{t("businessName")}</Label>
        <Input
          id="bp_business_name"
          className="h-11 md:h-10"
          aria-invalid={!!errors.business_name}
          {...register("business_name")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bp_phone">{t("contactPhone")}</Label>
        <Input
          id="bp_phone"
          type="tel"
          dir="ltr"
          placeholder="+20 1xx xxx xxxx"
          className="h-11 font-mono md:h-10"
          {...register("contact_phone")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bp_email">{t("contactEmail")}</Label>
        <Input
          id="bp_email"
          type="email"
          dir="ltr"
          placeholder="hello@yourbrand.com"
          className="h-11 md:h-10"
          aria-invalid={!!errors.contact_email}
          {...register("contact_email")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bp_address">{t("address")}</Label>
        <Textarea id="bp_address" rows={2} className="text-base md:text-sm" {...register("address")} />
      </div>
    </>
  );
}
