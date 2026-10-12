"use client";

import { useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { platformSettingsSchemas, type PlatformSettings } from "@/domain/platform/settings.schema";
import { updateSettingAction } from "./actions";

const CARD = "flex min-w-0 flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:p-5";
const FIELD = "h-11 md:h-10";

export function GeneralTab({
  locale,
  branding,
  announcement,
}: {
  locale: string;
  branding: PlatformSettings["branding"];
  announcement: PlatformSettings["announcement"];
}) {
  const t = useTranslations("admin.settings");
  const tErrors = useTranslations("admin.settings.errors");
  const [pending, startTransition] = useTransition();

  const brandingForm = useForm({
    resolver: zodResolver(platformSettingsSchemas.branding),
    defaultValues: branding,
  });
  const announcementForm = useForm({
    resolver: zodResolver(platformSettingsSchemas.announcement),
    defaultValues: announcement,
  });

  function save<K extends "branding" | "announcement">(key: K, values: PlatformSettings[K]) {
    startTransition(async () => {
      const result = await updateSettingAction(locale, key, values);
      if (result?.error) toast.error(tErrors(result.error));
      else toast.success(t("saved"));
    });
  }

  const [enabled, textAr, textEn] = useWatch({
    control: announcementForm.control,
    name: ["enabled", "text_ar", "text_en"],
  });
  const previewText = (locale === "ar" ? textAr || textEn : textEn || textAr).trim();

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      <section aria-labelledby="settings-identity" className={CARD}>
        <div>
          <h2 id="settings-identity" className="text-xl leading-7 font-semibold">
            {t("general.brandingTitle")}
          </h2>
          <p className="text-muted-foreground">{t("general.brandingHint")}</p>
        </div>
        <form
          onSubmit={brandingForm.handleSubmit((values) => save("branding", values))}
          className="flex flex-col gap-4"
          noValidate
        >
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="app_name_ar">{t("general.appNameAr")}</Label>
              <Input id="app_name_ar" dir="rtl" className={FIELD} {...brandingForm.register("app_name_ar")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="app_name_en">{t("general.appNameEn")}</Label>
              <Input id="app_name_en" dir="ltr" className={FIELD} {...brandingForm.register("app_name_en")} />
            </div>
            <div className="col-span-full flex flex-col gap-1.5">
              <Label htmlFor="support_email">{t("general.supportEmail")}</Label>
              <Input
                id="support_email"
                type="email"
                dir="ltr"
                className={FIELD}
                aria-invalid={!!brandingForm.formState.errors.support_email}
                aria-describedby="support_email_hint"
                {...brandingForm.register("support_email")}
              />
              {brandingForm.formState.errors.support_email ? (
                <p id="support_email_hint" className="text-[0.8125rem] text-destructive">
                  {t("general.invalidEmail")}
                </p>
              ) : (
                <p id="support_email_hint" className="text-[0.8125rem] text-muted-foreground">
                  {t("general.supportEmailHint")}
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending} className="min-w-24">
              {t("save")}
            </Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="settings-announcement" className={CARD}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="settings-announcement" className="text-xl leading-7 font-semibold">
              {t("general.announcementTitle")}
            </h2>
            <p className="text-muted-foreground">{t("general.announcementHint")}</p>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 font-medium">
            {enabled ? t("general.shown") : t("general.hidden")}
            <Switch
              checked={enabled}
              onCheckedChange={(v) => announcementForm.setValue("enabled", v, { shouldDirty: true })}
              aria-label={t("general.announcementEnabled")}
            />
          </label>
        </div>

        <div
          aria-label={t("general.preview")}
          className={cn("overflow-hidden rounded-lg ring-1 ring-border transition-opacity", !enabled && "opacity-50")}
        >
          <div className="flex items-center justify-center gap-2 bg-sidebar px-3.5 py-2 text-center font-medium text-sidebar-primary-foreground">
            <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
            <span className="min-w-0 break-words">{previewText || t("general.previewPlaceholder")}</span>
          </div>
          <div className="flex h-11 items-center bg-background px-3.5 text-xs text-muted-foreground">
            {t("general.previewCaption")}
          </div>
        </div>

        <form
          onSubmit={announcementForm.handleSubmit((values) => save("announcement", values))}
          className="flex flex-col gap-4"
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="text_ar">{t("general.announcementTextAr")}</Label>
            <Textarea id="text_ar" dir="rtl" rows={2} className="text-base md:text-sm" {...announcementForm.register("text_ar")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="text_en">{t("general.announcementTextEn")}</Label>
            <Textarea id="text_en" dir="ltr" rows={2} className="text-base md:text-sm" {...announcementForm.register("text_en")} />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending} className="min-w-24">
              {t("save")}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
