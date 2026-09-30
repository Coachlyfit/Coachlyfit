"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BellRing, Ruler } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BodyProfileForm, type BodyProfileValues } from "@/components/nutrition/body-profile-form";
import { usePushSubscription } from "@/components/dashboard/use-push-subscription";
import { addDays } from "@/domain/nutrition/adherence";
import type { AppLocale } from "@/domain/locale";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { logNutritionAction, saveMyBodyProfileAction, saveReminderSettingsAction } from "./actions";
import { OffPlanSheet } from "./off-plan-sheet";

export type LogView = {
  log_date: string;
  kcal: number | null;
  protein_g: number | null;
  carb_g: number | null;
  fat_g: number | null;
  off_plan: boolean;
  off_plan_meal: string | null;
};

const DAYS_BACK = 7;

const noSubscribe = () => () => {};

function deviceToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Daily intake logging on the client's diet screen: pick one of the last
 * 7 days (by the device's own calendar), log kcal (+ optional macros),
 * report the day off-plan, and manage the logging reminder and the body
 * data behind the coach's target suggestion. */
export function NutritionLogPanel({
  locale,
  coachId,
  clientId,
  serverToday,
  logs,
  reminder,
  bodyProfile,
  mealLabels,
}: {
  locale: AppLocale;
  coachId: string;
  clientId: string;
  serverToday: string;
  logs: LogView[];
  reminder: { enabled: boolean; remind_at: string; timezone: string } | null;
  bodyProfile: BodyProfileValues | null;
  mealLabels: string[];
}) {
  const t = useTranslations("nutrition");
  // The server only knows UTC; the device's own date takes over once
  // hydrated (server snapshot keeps the first client render in agreement).
  const today = useSyncExternalStore(noSubscribe, deviceToday, () => serverToday);
  const [picked, setSelected] = useState<string | null>(null);
  const selected = picked ?? today;

  const days = Array.from({ length: DAYS_BACK }, (_, i) => addDays(today, -i));
  const byDate = new Map(logs.map((l) => [l.log_date, l]));
  const log = byDate.get(selected) ?? null;
  const dayLabel = (date: string) =>
    date === today
      ? t("log.today")
      : date === addDays(today, -1)
        ? t("log.yesterday")
        : formatDate(date, locale, { weekday: "short", timeZone: "UTC" });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{t("log.title")}</CardTitle>
        <div className="flex gap-1">
          <ReminderSheet locale={locale} reminder={reminder} />
          <BodyProfileSheet locale={locale} profile={bodyProfile} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 no-scrollbar" role="group" aria-label={t("log.pickDay")}>
          {days.map((date) => {
            const dayLog = byDate.get(date);
            return (
              <button
                key={date}
                type="button"
                aria-pressed={date === selected}
                onClick={() => setSelected(date)}
                className={cn(
                  "flex min-w-14 shrink-0 flex-col items-center gap-0.5 rounded-lg border px-2 py-1.5 text-xs",
                  date === selected ? "border-primary bg-primary/10 font-medium" : "border-border",
                  dayLog?.off_plan && "ring-1 ring-amber-500/60"
                )}
              >
                <span>{dayLabel(date)}</span>
                <span className="text-muted-foreground tabular-nums">{Number(date.slice(8))}</span>
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    dayLog?.off_plan ? "bg-amber-500" : dayLog?.kcal != null ? "bg-primary" : "bg-transparent"
                  )}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>

        {log?.off_plan && (
          <Badge variant="outline" className="self-start border-amber-500/60">
            {t("offPlan.label")}
            {log.off_plan_meal && ` · ${log.off_plan_meal}`}
          </Badge>
        )}

        <LogForm key={`${selected}-${log?.kcal ?? ""}`} locale={locale} date={selected} log={log} />

        <OffPlanSheet
          locale={locale}
          coachId={coachId}
          clientId={clientId}
          date={selected}
          dateLabel={formatDate(selected, locale, { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" })}
          mealLabels={mealLabels}
        />
      </CardContent>
    </Card>
  );
}

function LogForm({ locale, date, log }: { locale: AppLocale; date: string; log: LogView | null }) {
  const t = useTranslations("nutrition");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState({
    kcal: log?.kcal?.toString() ?? "",
    protein_g: log?.protein_g?.toString() ?? "",
    carb_g: log?.carb_g?.toString() ?? "",
    fat_g: log?.fat_g?.toString() ?? "",
  });
  const field = (key: keyof typeof values) => ({
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value })),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await logNutritionAction(locale, { log_date: date, ...values });
      if (result?.error) {
        toast.error(t(`errors.${result.error}`));
        return;
      }
      toast.success(t("log.saved"));
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="log-kcal">{t("log.kcal")}</Label>
        <Input id="log-kcal" type="number" inputMode="numeric" min={1} required {...field("kcal")} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(["protein_g", "carb_g", "fat_g"] as const).map((key) => (
          <div key={key} className="flex flex-col gap-1.5">
            <Label htmlFor={`log-${key}`} className="text-xs">
              {t(`log.${key}`)}
            </Label>
            <Input id={`log-${key}`} type="number" inputMode="decimal" min={0} {...field(key)} />
          </div>
        ))}
      </div>
      {log?.kcal != null && (
        <p className="text-xs text-muted-foreground">{t("log.loggedAs", { kcal: formatNumber(log.kcal, locale) })}</p>
      )}
      <Button type="submit" disabled={pending || values.kcal === ""}>
        {pending ? tCommon("pending") : t("log.save")}
      </Button>
    </form>
  );
}

function ReminderSheet({
  locale,
  reminder,
}: {
  locale: AppLocale;
  reminder: { enabled: boolean; remind_at: string; timezone: string } | null;
}) {
  const t = useTranslations("nutrition.reminders");
  const tErrors = useTranslations("nutrition.errors");
  const tCommon = useTranslations("common");
  const push = usePushSubscription();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(reminder?.enabled ?? false);
  const [time, setTime] = useState(reminder?.remind_at.slice(0, 5) ?? "20:00");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  function save() {
    startTransition(async () => {
      // A reminder is a push notification, so turning it on subscribes this
      // device if it isn't already (the browser asks for permission).
      if (enabled && push.supported && !push.subscribed) {
        try {
          await push.toggle();
        } catch {
          toast.error(t("pushFailed"));
        }
      }
      const result = await saveReminderSettingsAction(locale, { enabled, remind_at: time, timezone });
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      toast.success(t("saved"));
      setOpen(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t("title")} />}>
        <BellRing className={cn("size-4", reminder?.enabled && "text-primary")} />
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="reminder-enabled">{t("enabled")}</Label>
            <Switch id="reminder-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reminder-time">{t("time")}</Label>
            <Input
              id="reminder-time"
              type="time"
              value={time}
              disabled={!enabled}
              onChange={(e) => setTime(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("timezone", { timezone })}</p>
          </div>
          {enabled && !push.supported && <p className="text-sm text-muted-foreground">{t("pushUnsupported")}</p>}
          <Button type="button" onClick={save} disabled={pending || push.pending || !time}>
            {pending ? tCommon("pending") : t("save")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BodyProfileSheet({ locale, profile }: { locale: AppLocale; profile: BodyProfileValues | null }) {
  const t = useTranslations("nutrition.bodyProfile");
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t("title")} />}>
        <Ruler className="size-4" />
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>
        <div className="px-4">
          <BodyProfileForm
            initial={profile}
            save={(input) => saveMyBodyProfileAction(locale, input)}
            onSaved={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
