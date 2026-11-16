"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, MapPin, Plus, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { AppointmentDialog } from "@/components/appointments/appointment-dialog";
import { AppointmentDetail } from "@/components/appointments/appointment-detail";
import { StatusBadge, type AppointmentView } from "@/components/appointments/shared";
import { formatRange, formatTime } from "@/components/appointments/format";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { addDays, localDateTime } from "@/domain/appointments/tz";
import type { AppLocale } from "@/domain/locale";

const HOUR_PX = 56;

type Props = {
  view: "day" | "week";
  /** The anchor day, YYYY-MM-DD (in `timeZone`). */
  date: string;
  /** First day shown: `date` for day view, the week's first day for week view. */
  rangeStart: string;
  today: string;
  timeZone: string;
  appointments: AppointmentView[];
  requests: AppointmentView[];
  clients: { id: string; display_name: string }[];
  hrefs: { prev: string; next: string; today: string; day: string; week: string };
  /** Shown above the calendar (e.g. the Google reconnect banner). */
  banner?: ReactNode;
};

export function ScheduleView({ view, date, rangeStart, today, timeZone, appointments, requests, clients, hrefs, banner }: Props) {
  const t = useTranslations("appointments");
  const locale = useLocale() as AppLocale;
  const [selected, setSelected] = useState<AppointmentView | null>(null);
  const [form, setForm] = useState<{ open: boolean; editing: AppointmentView | null }>({ open: false, editing: null });

  const days = useMemo(
    () => Array.from({ length: view === "day" ? 1 : 7 }, (_, i) => addDays(rangeStart, i)),
    [view, rangeStart]
  );
  const byDay = useMemo(() => {
    const map = new Map<string, AppointmentView[]>();
    for (const a of appointments) {
      const day = localDateTime(new Date(a.startsAt), timeZone).date;
      map.set(day, [...(map.get(day) ?? []), a]);
    }
    return map;
  }, [appointments, timeZone]);

  const dayLabel = (day: string, long = false) =>
    formatDate(`${day}T12:00:00Z`, locale, {
      weekday: long ? "long" : "short",
      day: "numeric",
      month: long ? "long" : "short",
      timeZone: "UTC",
    });
  const title = view === "day" ? dayLabel(date, true) : `${dayLabel(days[0])} – ${dayLabel(days[6])}`;
  // The detail dialog and the form are both modal: reschedule closes one, opens the other.
  const openForm = (editing: AppointmentView | null) => {
    setSelected(null);
    setForm({ open: true, editing });
  };

  return (
    <div className="flex flex-col gap-4">
      {banner}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label={t("prev")} nativeButton={false} render={<Link href={hrefs.prev} scroll={false} />}>
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </Button>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={hrefs.today} scroll={false} />}>
            {t("today")}
          </Button>
          <Button variant="outline" size="icon-sm" aria-label={t("next")} nativeButton={false} render={<Link href={hrefs.next} scroll={false} />}>
            <ChevronRight className="size-4 rtl:rotate-180" />
          </Button>
        </div>
        <h2 className="min-w-0 flex-1 text-center text-base font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-muted p-0.5">
            {(["day", "week"] as const).map((v) => (
              <Button
                key={v}
                size="sm"
                variant={view === v ? "default" : "ghost"}
                nativeButton={false}
                render={<Link href={v === "day" ? hrefs.day : hrefs.week} scroll={false} />}
              >
                {t(v)}
              </Button>
            ))}
          </div>
          <Button size="sm" onClick={() => openForm(null)}>
            <Plus className="size-4" />
            {t("newAppointment")}
          </Button>
        </div>
      </div>

      {requests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("requests", { count: requests.length })}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {requests.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelected(a)}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-start text-sm hover:bg-muted"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{a.clientName}</span>
                  <span className="text-muted-foreground">{formatRange(a.startsAt, a.endsAt, locale, timeZone)}</span>
                </span>
                {a.status === "confirmed" ? (
                  <span className="shrink-0 text-xs text-warning-tint-foreground">{t("detail.rescheduleRequested")}</span>
                ) : (
                  <StatusBadge status={a.status} />
                )}
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {view === "day" ? (
        <DayGrid
          day={days[0]}
          appointments={(byDay.get(days[0]) ?? []).filter((a) => a.status !== "cancelled")}
          timeZone={timeZone}
          onSelect={setSelected}
        />
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
          {days.map((day) => {
            const list = byDay.get(day) ?? [];
            return (
              <section key={day} className={cn("flex min-h-24 flex-col gap-1.5 rounded-xl border p-2", day === today && "border-primary")}>
                <h3 className={cn("text-xs font-medium", day === today ? "text-primary" : "text-muted-foreground")}>{dayLabel(day)}</h3>
                {list.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelected(a)}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-lg border px-2 py-1.5 text-start text-xs hover:bg-muted",
                      a.status === "cancelled" && "opacity-50",
                      a.status === "requested" && "border-dashed"
                    )}
                  >
                    <span className="font-medium tabular-nums">{formatTime(a.startsAt, locale, timeZone)}</span>
                    <span className={cn("truncate", a.status === "cancelled" && "line-through")}>{a.clientName}</span>
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      )}

      {appointments.length === 0 && requests.length === 0 && (
        <EmptyState title={t("empty.title")} description={t("empty.description")} />
      )}

      <AppointmentDetail appointment={selected} timeZone={timeZone} onClose={() => setSelected(null)} onReschedule={openForm} />
      <AppointmentDialog
        open={form.open}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        clients={clients}
        timeZone={timeZone}
        editing={form.editing}
        defaultDate={date}
      />
    </div>
  );
}

function DayGrid({
  day,
  appointments,
  timeZone,
  onSelect,
}: {
  day: string;
  appointments: AppointmentView[];
  timeZone: string;
  onSelect: (a: AppointmentView) => void;
}) {
  const locale = useLocale() as AppLocale;
  const placed = appointments.map((a) => {
    const local = localDateTime(new Date(a.startsAt), timeZone);
    const [h, m] = local.time.split(":").map(Number);
    const minutes = (new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60_000;
    return { a, start: h * 60 + m, minutes };
  });
  const firstHour = Math.min(7, ...placed.map((p) => Math.floor(p.start / 60)));
  const lastHour = Math.max(21, ...placed.map((p) => Math.ceil((p.start + p.minutes) / 60)));
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i);

  return (
    <div className="relative rounded-xl border" style={{ height: hours.length * HOUR_PX }} data-day={day}>
      {hours.map((h, i) => (
        <div key={h} className="absolute inset-x-0 border-t border-border/60" style={{ top: i * HOUR_PX }}>
          <span className="absolute start-2 -top-2.5 bg-background px-1 text-[11px] tabular-nums text-muted-foreground">
            {String(h).padStart(2, "0")}:00
          </span>
        </div>
      ))}
      {placed.map(({ a, start, minutes }) => {
        const Icon = a.type === "online" ? Video : MapPin;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a)}
            className={cn(
              "absolute start-16 end-2 flex min-h-6 flex-col justify-center overflow-hidden rounded-lg border bg-card px-2 text-start text-xs shadow-xs hover:bg-muted",
              a.status === "requested" && "border-dashed"
            )}
            style={{ top: ((start - firstHour * 60) / 60) * HOUR_PX, height: Math.max((minutes / 60) * HOUR_PX - 2, 24) }}
          >
            <span className="flex items-center gap-1 truncate font-medium">
              <Icon className="size-3 shrink-0" aria-hidden="true" />
              {a.clientName}
            </span>
            <span className="truncate text-muted-foreground">{formatRange(a.startsAt, a.endsAt, locale, timeZone)}</span>
          </button>
        );
      })}
    </div>
  );
}
