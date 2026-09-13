"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlatformSettings } from "@/domain/platform/settings.schema";
import { updateSettingAction } from "./actions";

export function PlatformTab({
  locale,
  platform,
  billing,
}: {
  locale: string;
  platform: PlatformSettings["platform"];
  billing: PlatformSettings["billing"];
}) {
  const t = useTranslations("admin.settings");
  const tErrors = useTranslations("admin.settings.errors");
  const [pending, startTransition] = useTransition();
  const [maintenanceMode, setMaintenanceMode] = useState(platform.maintenance_mode);
  const [signupsEnabled, setSignupsEnabled] = useState(platform.signups_enabled);
  const [trialDays, setTrialDays] = useState(String(billing.trial_days));

  function toggle(key: "maintenance_mode" | "signups_enabled", next: boolean) {
    const setter = key === "maintenance_mode" ? setMaintenanceMode : setSignupsEnabled;
    setter(next);
    startTransition(async () => {
      const result = await updateSettingAction(locale, "platform", {
        maintenance_mode: key === "maintenance_mode" ? next : maintenanceMode,
        signups_enabled: key === "signups_enabled" ? next : signupsEnabled,
      });
      if (result?.error) {
        setter(!next);
        toast.error(tErrors(result.error));
      }
    });
  }

  function saveTrialDays() {
    const days = Number(trialDays);
    startTransition(async () => {
      const result = await updateSettingAction(locale, "billing", { trial_days: days });
      if (result?.error) toast.error(tErrors(result.error));
      else toast.success(t("saved"));
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-start">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("platform.togglesTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="maintenance_mode" className="text-sm font-normal">
                {t("platform.maintenanceMode")}
              </Label>
              <span className="text-xs text-muted-foreground">{t("platform.maintenanceModeHint")}</span>
            </div>
            <Switch
              id="maintenance_mode"
              checked={maintenanceMode}
              disabled={pending}
              onCheckedChange={(v) => toggle("maintenance_mode", v)}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="signups_enabled" className="text-sm font-normal">
                {t("platform.signupsEnabled")}
              </Label>
              <span className="text-xs text-muted-foreground">{t("platform.signupsEnabledHint")}</span>
            </div>
            <Switch
              id="signups_enabled"
              checked={signupsEnabled}
              disabled={pending}
              onCheckedChange={(v) => toggle("signups_enabled", v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("platform.billingTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="trial_days">{t("platform.trialDays")}</Label>
            <Input
              id="trial_days"
              type="number"
              min={1}
              max={365}
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
            />
          </div>
          <Button type="button" disabled={pending} onClick={saveTrialDays} className="min-w-24">
            {t("save")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
