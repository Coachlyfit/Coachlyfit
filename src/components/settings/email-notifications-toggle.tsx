"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { updateEmailNotificationsAction } from "@/app/[locale]/(coach)/settings/actions";

export function EmailNotificationsToggle({ locale, enabled }: { locale: string; enabled: boolean }) {
  const t = useTranslations("settings");
  const tErrors = useTranslations("programs.errors");
  const [checked, setChecked] = useState(enabled);
  const [pending, startTransition] = useTransition();

  function onChange(next: boolean) {
    setChecked(next);
    startTransition(async () => {
      const result = await updateEmailNotificationsAction(locale, next);
      if (result?.error) {
        setChecked(!next);
        toast.error(tErrors.has(result.error) ? tErrors(result.error) : tErrors("unknown"));
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor="email_notifications" className="text-sm font-normal">
        {t("emailNotifications")}
      </Label>
      <Switch id="email_notifications" checked={checked} onCheckedChange={onChange} disabled={pending} />
    </div>
  );
}
