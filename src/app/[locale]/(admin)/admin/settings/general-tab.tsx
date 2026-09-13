"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { platformSettingsSchemas, type PlatformSettings } from "@/domain/platform/settings.schema";
import { updateSettingAction } from "./actions";

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

  function saveBranding(values: PlatformSettings["branding"]) {
    startTransition(async () => {
      const result = await updateSettingAction(locale, "branding", values);
      if (result?.error) toast.error(tErrors(result.error));
      else toast.success(t("saved"));
    });
  }

  function saveAnnouncement(values: PlatformSettings["announcement"]) {
    startTransition(async () => {
      const result = await updateSettingAction(locale, "announcement", values);
      if (result?.error) toast.error(tErrors(result.error));
      else toast.success(t("saved"));
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-start">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("general.brandingTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={brandingForm.handleSubmit(saveBranding)} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="app_name_ar">{t("general.appNameAr")}</Label>
              <Input id="app_name_ar" dir="rtl" {...brandingForm.register("app_name_ar")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="app_name_en">{t("general.appNameEn")}</Label>
              <Input id="app_name_en" dir="ltr" {...brandingForm.register("app_name_en")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="support_email">{t("general.supportEmail")}</Label>
              <Input id="support_email" type="email" dir="ltr" {...brandingForm.register("support_email")} />
              {brandingForm.formState.errors.support_email && (
                <p className="text-sm text-destructive">{t("general.invalidEmail")}</p>
              )}
            </div>
            <Button type="submit" disabled={pending} className="min-w-24">
              {t("save")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("general.announcementTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={announcementForm.handleSubmit(saveAnnouncement)} className="flex flex-col gap-4" noValidate>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="announcement_enabled" className="text-sm font-normal">
                {t("general.announcementEnabled")}
              </Label>
              <Switch
                id="announcement_enabled"
                checked={announcementForm.watch("enabled")}
                onCheckedChange={(v) => announcementForm.setValue("enabled", v)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="text_ar">{t("general.announcementTextAr")}</Label>
              <Textarea id="text_ar" dir="rtl" rows={2} {...announcementForm.register("text_ar")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="text_en">{t("general.announcementTextEn")}</Label>
              <Textarea id="text_en" dir="ltr" rows={2} {...announcementForm.register("text_en")} />
            </div>
            <Button type="submit" disabled={pending} className="min-w-24">
              {t("save")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
