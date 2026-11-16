"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/appointments/shared";
import { formatDate } from "@/lib/format";
import { addDays } from "@/domain/appointments/tz";
import type { AppLocale } from "@/domain/locale";
import type { SettingsInput } from "@/domain/appointments/schemas";
import {
  removeExceptionAction,
  saveAvailabilityAction,
  saveExceptionAction,
  saveScheduleSettingsAction,
} from "@/app/[locale]/(coach)/settings/schedule-actions";

type Range = { weekday: number; start_time: string; end_time: string };
type ExceptionItem = { id: string; date: string; is_off: boolean; start_time: string | null; end_time: string | null };

const hhmm = (value: string) => value.slice(0, 5);

function useError() {
  const t = useTranslations("appointments.errors");
  // Block body: returns void, so `return fail(...)` is fine inside startTransition(async ...).
  return (code: string) => {
    toast.error(t.has(code) ? t(code) : t("unknown"));
  };
}

/** Sunday-based weekday numbers in the order the week reads in `locale`. */
function weekOrder(locale: AppLocale) {
  return locale === "ar" ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
}

function weekdayName(weekday: number, locale: AppLocale) {
  // 2026-01-04 is a Sunday.
  return formatDate(`${addDays("2026-01-04", weekday)}T12:00:00Z`, locale, { weekday: "long", timeZone: "UTC" });
}

export function ScheduleSettings({
  rules,
  exceptions,
  settings,
  timeZone,
}: {
  rules: Range[];
  exceptions: ExceptionItem[];
  settings: SettingsInput;
  timeZone: string;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <AvailabilityCard rules={rules} timeZone={timeZone} />
      <div className="flex flex-col gap-6">
        <PolicyCard settings={settings} />
        <ExceptionsCard exceptions={exceptions} />
      </div>
    </div>
  );
}

function AvailabilityCard({ rules, timeZone }: { rules: Range[]; timeZone: string }) {
  const t = useTranslations("appointments.settings");
  const tCommon = useTranslations("common");
  const locale = useLocale() as AppLocale;
  const fail = useError();
  const [pending, startTransition] = useTransition();
  const [ranges, setRanges] = useState<Range[]>(() =>
    rules.map((r) => ({ weekday: r.weekday, start_time: hhmm(r.start_time), end_time: hhmm(r.end_time) }))
  );
  const [zone, setZone] = useState(timeZone);
  const zones = useMemo(() => {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return all.includes(timeZone) ? all : [timeZone, ...all];
  }, [timeZone]);

  const patch = (index: number, change: Partial<Range>) =>
    setRanges((rs) => rs.map((r, i) => (i === index ? { ...r, ...change } : r)));

  function save() {
    startTransition(async () => {
      const result = await saveAvailabilityAction(locale, { timezone: zone, rules: ranges });
      if (result?.error) return fail(result.error);
      toast.success(t("saved"));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("availability")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sched_tz">{t("timeZone")}</Label>
          <NativeSelect id="sched_tz" value={zone} onChange={(event) => setZone(event.target.value)} dir="ltr">
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-col divide-y">
          {weekOrder(locale).map((weekday) => {
            const day = ranges.map((r, index) => ({ r, index })).filter(({ r }) => r.weekday === weekday);
            return (
              <div key={weekday} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <span className="w-24 pt-2 text-sm font-medium">{weekdayName(weekday, locale)}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {day.length === 0 && <span className="pt-2 text-sm text-muted-foreground">{t("off")}</span>}
                  {day.map(({ r, index }) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        type="time"
                        dir="ltr"
                        aria-label={t("from")}
                        value={r.start_time}
                        onChange={(event) => patch(index, { start_time: event.target.value })}
                      />
                      <span aria-hidden="true">–</span>
                      <Input
                        type="time"
                        dir="ltr"
                        aria-label={t("to")}
                        value={r.end_time}
                        onChange={(event) => patch(index, { end_time: event.target.value })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("removeRange")}
                        onClick={() => setRanges((rs) => rs.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("addRange")}
                  onClick={() => setRanges((rs) => [...rs, { weekday, start_time: "09:00", end_time: "17:00" }])}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            );
          })}
        </div>

        <Button type="button" onClick={save} disabled={pending} className="self-start min-w-24">
          {pending ? tCommon("pending") : t("save")}
        </Button>
      </CardContent>
    </Card>
  );
}

function PolicyCard({ settings }: { settings: SettingsInput }) {
  const t = useTranslations("appointments.settings");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const fail = useError();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState(settings);

  const field = (key: keyof SettingsInput, label: string, hint: string, min = 0, max = 336) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`policy_${key}`}>{label}</Label>
      <Input
        id={`policy_${key}`}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        dir="ltr"
        value={values[key]}
        onChange={(event) => setValues((v) => ({ ...v, [key]: Number(event.target.value) }))}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  function save() {
    startTransition(async () => {
      const result = await saveScheduleSettingsAction(locale, values);
      if (result?.error) return fail(result.error);
      toast.success(t("saved"));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("policy")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {field("cancel_cutoff_hours", t("cutoff"), t("cutoffHint"))}
        {field("slot_minutes", t("slotMinutes"), t("slotMinutesHint"), 15, 240)}
        {field("min_notice_hours", t("minNotice"), t("minNoticeHint"), 0, 168)}
        <Button type="button" onClick={save} disabled={pending} className="self-start min-w-24">
          {pending ? tCommon("pending") : t("save")}
        </Button>
      </CardContent>
    </Card>
  );
}

function ExceptionsCard({ exceptions }: { exceptions: ExceptionItem[] }) {
  const t = useTranslations("appointments.settings");
  const tCommon = useTranslations("common");
  const locale = useLocale() as AppLocale;
  const fail = useError();
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState("");
  const [isOff, setIsOff] = useState(true);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("14:00");

  function add() {
    if (!date) {
      toast.error(t("pickDate"));
      return;
    }
    startTransition(async () => {
      const result = await saveExceptionAction(locale, {
        date,
        is_off: isOff,
        start_time: isOff ? null : start,
        end_time: isOff ? null : end,
      });
      if (result?.error) return fail(result.error);
      setDate("");
      toast.success(t("saved"));
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await removeExceptionAction(locale, id);
      if (result?.error) fail(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("daysOff")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {exceptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noExceptions")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {exceptions.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  {formatDate(`${e.date}T12:00:00Z`, locale, { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
                  <span className="text-muted-foreground">
                    {" · "}
                    {e.is_off ? t("dayOff") : `${hhmm(e.start_time ?? "")}–${hhmm(e.end_time ?? "")}`}
                  </span>
                </span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t("removeException")} disabled={pending} onClick={() => remove(e.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-3 border-t pt-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="exception_date">{t("date")}</Label>
            <DatePicker id="exception_date" value={date} onChange={setDate} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isOff} onChange={(event) => setIsOff(event.target.checked)} className="size-4" />
            {t("wholeDayOff")}
          </label>
          {!isOff && (
            <div className="flex items-center gap-2">
              <Input type="time" dir="ltr" aria-label={t("from")} value={start} onChange={(event) => setStart(event.target.value)} />
              <span aria-hidden="true">–</span>
              <Input type="time" dir="ltr" aria-label={t("to")} value={end} onChange={(event) => setEnd(event.target.value)} />
            </div>
          )}
          <Button type="button" variant="outline" onClick={add} disabled={pending} className="self-start min-w-24">
            {pending ? tCommon("pending") : t("addException")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
