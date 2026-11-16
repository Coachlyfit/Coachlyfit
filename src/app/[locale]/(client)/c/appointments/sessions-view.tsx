"use client";

import { useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { CalendarPlus, MapPin, Plus, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/date-picker";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FeedCard } from "@/components/appointments/feed-card";
import { NativeSelect, StatusBadge, type AppointmentView } from "@/components/appointments/shared";
import { formatRange, formatTime } from "@/components/appointments/format";
import { cn } from "@/lib/utils";
import { localDateTime } from "@/domain/appointments/tz";
import type { AppLocale } from "@/domain/locale";
import {
  cancelMyAppointmentAction,
  listFreeSlotsAction,
  requestAppointmentAction,
  requestRescheduleAction,
  rotateMyFeedTokenAction,
  saveMyTimeZoneAction,
} from "./actions";

export type ClientAppointment = AppointmentView & {
  /** Past the coach's cancel/reschedule cutoff: online changes are closed. */
  locked: boolean;
};

type Props = {
  upcoming: ClientAppointment[];
  past: ClientAppointment[];
  timeZone: string;
  cutoffHours: number;
  feed: { baseUrl: string; token: string };
};

function useErrorToast() {
  const t = useTranslations("appointments.errors");
  // Block body: returns void, so `return fail(...)` is fine inside startTransition(async ...).
  return (code: string) => {
    toast.error(t.has(code) ? t(code) : t("unknown"));
  };
}

export function SessionsView({ upcoming, past, timeZone, cutoffHours, feed }: Props) {
  const t = useTranslations("appointments");
  const [requesting, setRequesting] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("client.title")}</h1>
        <Button size="sm" onClick={() => setRequesting(true)}>
          <Plus className="size-4" />
          {t("client.request")}
        </Button>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t("client.upcoming")}</h2>
        {upcoming.length === 0 ? (
          <EmptyState title={t("client.noUpcoming")} description={t("client.noUpcomingHint")} />
        ) : (
          upcoming.map((a) => <SessionRow key={a.id} a={a} timeZone={timeZone} cutoffHours={cutoffHours} />)
        )}
      </section>

      {past.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">{t("client.past")}</h2>
          {past.map((a) => (
            <SessionRow key={a.id} a={a} timeZone={timeZone} cutoffHours={cutoffHours} readOnly />
          ))}
        </section>
      )}

      <TimeZonePicker timeZone={timeZone} />

      <Card>
        <CardContent>
          <FeedCard baseUrl={feed.baseUrl} token={feed.token} rotate={rotateMyFeedTokenAction} />
        </CardContent>
      </Card>

      <RequestDialog open={requesting} onOpenChange={setRequesting} timeZone={timeZone} />
    </div>
  );
}

function SessionRow({
  a,
  timeZone,
  cutoffHours,
  readOnly,
}: {
  a: ClientAppointment;
  timeZone: string;
  cutoffHours: number;
  readOnly?: boolean;
}) {
  const t = useTranslations("appointments");
  const locale = useLocale() as AppLocale;
  const fail = useErrorToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<"cancel" | "reschedule" | null>(null);
  const [text, setText] = useState("");
  const Icon = a.type === "online" ? Video : MapPin;

  // A pending request can always be withdrawn; a confirmed session only until the cutoff.
  const canCancel = !readOnly && (a.status === "requested" || (a.status === "confirmed" && !a.locked));
  const canReschedule = !readOnly && a.status === "confirmed" && !a.locked && !a.rescheduleRequestedAt;

  function submit() {
    startTransition(async () => {
      const result =
        dialog === "cancel"
          ? await cancelMyAppointmentAction(locale, a.id, text)
          : await requestRescheduleAction(locale, a.id, text);
      if (result?.error) return fail(result.error);
      toast.success(dialog === "cancel" ? t("toast.cancelled") : t("toast.rescheduleRequested"));
      setDialog(null);
      setText("");
      router.refresh();
    });
  }

  return (
    <Card className={cn(a.status === "cancelled" && "opacity-60")}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">{formatRange(a.startsAt, a.endsAt, locale, timeZone)}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words" dir="auto">
                {a.type === "online" ? (a.location ? a.location : t("type.online")) : a.location || t("type.in_person")}
              </span>
            </p>
          </div>
          <StatusBadge status={a.status} />
        </div>

        {a.rescheduleRequestedAt && a.status === "confirmed" && (
          <p className="text-sm text-muted-foreground">{t("client.rescheduleSent")}</p>
        )}
        {!readOnly && a.status === "confirmed" && a.locked && (
          <p className="text-sm text-muted-foreground">{t("client.locked", { hours: cutoffHours })}</p>
        )}

        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            {a.status !== "cancelled" && (
              <Button variant="ghost" size="sm" nativeButton={false} render={<a href={`/api/appointments/${a.id}/ics`} download />}>
                <CalendarPlus className="size-4" />
                {t("detail.addToCalendar")}
              </Button>
            )}
            {canReschedule && (
              <Button variant="outline" size="sm" onClick={() => setDialog("reschedule")}>
                {t("client.requestReschedule")}
              </Button>
            )}
            {canCancel && (
              <Button variant="outline" size="sm" onClick={() => setDialog("cancel")}>
                {t("client.cancel")}
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "cancel" ? t("client.cancelTitle") : t("client.rescheduleTitle")}</DialogTitle>
            <DialogDescription>
              {dialog === "cancel" ? t("client.cancelHint") : t("client.rescheduleHint")}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            dir="auto"
            maxLength={500}
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-label={dialog === "cancel" ? t("detail.cancelReason") : t("client.rescheduleNote")}
          />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{t("client.keep")}</DialogClose>
            <Button variant={dialog === "cancel" ? "destructive" : "default"} disabled={pending} onClick={submit} className="min-w-24">
              {dialog === "cancel" ? t("client.cancel") : t("client.sendRequest")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function RequestDialog({
  open,
  onOpenChange,
  timeZone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timeZone: string;
}) {
  const t = useTranslations("appointments");
  const locale = useLocale() as AppLocale;
  const fail = useErrorToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(() => localDateTime(new Date(), timeZone).date);
  const [slot, setSlot] = useState<string | null>(null);
  const [type, setType] = useState<"online" | "in_person">("online");
  const [notes, setNotes] = useState("");

  const slots = useQuery({
    queryKey: ["appointment-slots", date, timeZone],
    queryFn: () => listFreeSlotsAction(date),
    enabled: open && !!date,
  });

  const list = useMemo(() => slots.data ?? [], [slots.data]);

  function submit() {
    if (!slot) return;
    startTransition(async () => {
      const result = await requestAppointmentAction(locale, { starts_at: slot, type, notes });
      if (result?.error) {
        // Someone else may have just taken it: show the fresh list.
        await queryClient.invalidateQueries({ queryKey: ["appointment-slots"] });
        setSlot(null);
        return fail(result.error);
      }
      await queryClient.invalidateQueries({ queryKey: ["appointment-slots"] });
      toast.success(t("toast.requested"));
      setSlot(null);
      setNotes("");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("client.request")}</DialogTitle>
          <DialogDescription>{t("client.requestHint")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="req_date">{t("form.date")}</Label>
          <DatePicker
            id="req_date"
            value={date}
            onChange={(value) => {
              setDate(value);
              setSlot(null);
            }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>{t("client.availableTimes")}</Label>
          {slots.isPending ? (
            <p className="text-sm text-muted-foreground">{t("client.loadingSlots")}</p>
          ) : slots.isError ? (
            <p className="text-sm text-destructive">{t("client.slotsFailed")}</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("client.noSlots")}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {list.map((s) => (
                <Button
                  key={s.start}
                  type="button"
                  size="sm"
                  variant={slot === s.start ? "default" : "outline"}
                  aria-pressed={slot === s.start}
                  onClick={() => setSlot(s.start)}
                >
                  <span className="tabular-nums">{formatTime(s.start, locale, timeZone)}</span>
                </Button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="req_type">{t("form.type")}</Label>
          <NativeSelect id="req_type" value={type} onChange={(event) => setType(event.target.value as typeof type)}>
            <option value="online">{t("type.online")}</option>
            <option value="in_person">{t("type.in_person")}</option>
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="req_notes">{t("form.notes")}</Label>
          <Textarea id="req_notes" rows={2} maxLength={2000} dir="auto" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>

        <p className="text-xs text-muted-foreground">{t("form.timeZoneHint", { timeZone })}</p>

        <DialogFooter>
          <Button disabled={!slot || pending} onClick={submit} className="min-w-24">
            {t("client.sendRequest")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TimeZonePicker({ timeZone }: { timeZone: string }) {
  const t = useTranslations("appointments.client");
  const locale = useLocale();
  const router = useRouter();
  const fail = useErrorToast();
  const [pending, startTransition] = useTransition();
  const zones = useMemo(() => {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return all.includes(timeZone) ? all : [timeZone, ...all];
  }, [timeZone]);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="tz_picker">{t("timeZone")}</Label>
      <NativeSelect
        id="tz_picker"
        dir="ltr"
        value={timeZone}
        disabled={pending}
        onChange={(event) =>
          startTransition(async () => {
            const result = await saveMyTimeZoneAction(locale, event.target.value);
            if (result?.error) return fail(result.error);
            router.refresh();
          })
        }
      >
        {zones.map((z) => (
          <option key={z} value={z}>
            {z}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
