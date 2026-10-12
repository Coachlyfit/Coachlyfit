"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import type { PlatformSettings } from "@/domain/platform/settings.schema";
import { updateSettingAction } from "./actions";

// Bounds of platformSettingsSchemas.billing.trial_days.
const TRIAL_MIN = 1;
const TRIAL_MAX = 365;

export function PlatformTab({
  locale,
  platform,
  billing,
  affectedUsers,
}: {
  locale: AppLocale;
  platform: PlatformSettings["platform"];
  billing: PlatformSettings["billing"];
  /** Coaches + clients: everyone maintenance mode locks out. */
  affectedUsers: number;
}) {
  const t = useTranslations("admin.settings");
  const tErrors = useTranslations("admin.settings.errors");
  const [pending, startTransition] = useTransition();
  const [signups, setSignups] = useOptimistic(platform.signups_enabled);
  const [trialDays, setTrialDays] = useState(billing.trial_days);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const maintenance = platform.maintenance_mode;

  function savePlatform(next: PlatformSettings["platform"], after?: () => void) {
    startTransition(async () => {
      setSignups(next.signups_enabled);
      const result = await updateSettingAction(locale, "platform", next);
      if (result?.error) toast.error(tErrors(result.error));
      else after?.();
    });
  }

  function saveTrialDays() {
    startTransition(async () => {
      const result = await updateSettingAction(locale, "billing", { trial_days: trialDays });
      if (result?.error) toast.error(tErrors(result.error));
      else toast.success(t("saved"));
    });
  }

  return (
    <div className="flex max-w-[820px] flex-col gap-4">
      <section aria-label={t("platform.togglesTitle")} className="rounded-xl bg-card ring-1 ring-foreground/10">
        <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-border px-4 py-4 md:px-5">
          <span className="flex flex-col">
            <span className="text-[0.9375rem] font-semibold">{t("platform.signupsEnabled")}</span>
            <span className="text-muted-foreground">{t("platform.signupsEnabledHint")}</span>
          </span>
          <Switch
            checked={signups}
            disabled={pending}
            onCheckedChange={(v) => savePlatform({ maintenance_mode: maintenance, signups_enabled: v })}
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-5">
          <span className="flex flex-col">
            <span className="text-[0.9375rem] font-semibold">{t("platform.billingTitle")}</span>
            <span className="text-muted-foreground">{t("platform.trialHint")}</span>
          </span>
          <span className="flex items-center gap-1.5">
            {/* ponytail: explicit Save instead of a write per tap on the stepper. */}
            {trialDays !== billing.trial_days && (
              <Button type="button" size="sm" disabled={pending} onClick={saveTrialDays} className="me-1.5 h-11 md:h-10">
                {t("save")}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t("platform.decrease")}
              disabled={pending || trialDays <= TRIAL_MIN}
              onClick={() => setTrialDays((d) => Math.max(TRIAL_MIN, d - 1))}
              className="size-11 md:size-10"
            >
              <Minus className="size-4" aria-hidden="true" />
            </Button>
            <output
              aria-live="polite"
              className="flex h-11 min-w-19 items-center justify-center gap-1 rounded-[10px] border border-border px-2 md:h-10"
            >
              <span className="font-mono text-base font-semibold tabular-nums">{formatNumber(trialDays, locale)}</span>
              <span className="text-muted-foreground">{t("platform.days", { count: trialDays })}</span>
            </output>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t("platform.increase")}
              disabled={pending || trialDays >= TRIAL_MAX}
              onClick={() => setTrialDays((d) => Math.min(TRIAL_MAX, d + 1))}
              className="size-11 md:size-10"
            >
              <Plus className="size-4" aria-hidden="true" />
            </Button>
          </span>
        </div>
      </section>

      <section aria-labelledby="settings-danger" className="overflow-hidden rounded-xl bg-card ring-1 ring-destructive/30">
        <div className="border-b border-destructive/30 bg-destructive-tint/50 px-4 py-3 md:px-5">
          <h2 id="settings-danger" className="text-base font-semibold text-destructive-tint-foreground">
            {t("platform.dangerZone")}
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-5">
          <span className="flex max-w-[520px] flex-col">
            <span className="text-[0.9375rem] font-semibold">{t("platform.maintenanceMode")}</span>
            <span className="text-muted-foreground">{t("platform.maintenanceModeHint")}</span>
          </span>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            // Turning it off is always safe, so only switching on asks first.
            onClick={() =>
              maintenance ? savePlatform({ maintenance_mode: false, signups_enabled: signups }) : setConfirmOpen(true)
            }
            className={cn(
              "w-full font-semibold sm:w-auto",
              !maintenance && "bg-destructive-tint text-destructive-tint-foreground hover:bg-destructive-tint/70"
            )}
          >
            {maintenance ? t("platform.disableMaintenance") : t("platform.enableMaintenance")}
          </Button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("platform.confirmTitle")}
        description={t("platform.confirmBody", { count: affectedUsers, value: formatNumber(affectedUsers, locale) })}
        confirmLabel={t("platform.enableMaintenance")}
        pending={pending}
        onConfirm={() => savePlatform({ maintenance_mode: true, signups_enabled: signups }, () => setConfirmOpen(false))}
      />
    </div>
  );
}
