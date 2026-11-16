"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarPlus, MapPin, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, SyncIcon, type AppointmentView, type SyncState } from "@/components/appointments/shared";
import { formatRange } from "@/components/appointments/format";
import type { AppLocale } from "@/domain/locale";
import {
  acceptProposedTimeAction,
  cancelAppointmentAction,
  dismissRescheduleRequestAction,
  retryGoogleSyncAction,
  transitionAppointmentAction,
} from "@/app/[locale]/(coach)/schedule/actions";

type Props = {
  appointment: AppointmentView | null;
  timeZone: string;
  /** Google sync state; undefined when Google isn't connected. */
  syncState?: SyncState;
  onClose: () => void;
  onReschedule: (appointment: AppointmentView) => void;
};

// The body mounts only while an appointment is open (keyed by it), so "now" is
// read once per opening rather than during every render.
export function AppointmentDetail({ appointment, ...rest }: Props) {
  if (!appointment) return null;
  return <DetailBody key={appointment.id} appointment={appointment} {...rest} />;
}

function DetailBody({ appointment: a, timeZone, syncState, onClose, onReschedule }: Omit<Props, "appointment"> & { appointment: AppointmentView }) {
  const t = useTranslations("appointments");
  const tErrors = useTranslations("appointments.errors");
  const tCommon = useTranslations("common");
  const locale = useLocale() as AppLocale;
  const [pending, startTransition] = useTransition();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [now] = useState(() => Date.now());

  const live = a.status === "requested" || a.status === "confirmed";
  const started = new Date(a.startsAt).getTime() <= now;

  function fail(code: string) {
    toast.error(tErrors.has(code) ? tErrors(code) : tErrors("unknown"));
  }

  function transition(to: "confirm" | "complete" | "no_show", message: string) {
    startTransition(async () => {
      const result = await transitionAppointmentAction(locale, a.id, to);
      if (result?.error) return fail(result.error);
      toast.success(message);
      onClose();
    });
  }

  function acceptProposal() {
    startTransition(async () => {
      const result = await acceptProposedTimeAction(locale, a.id);
      if (result?.error) return fail(result.error);
      toast.success(t("toast.rescheduled"));
      onClose();
    });
  }

  function keepOriginal() {
    startTransition(async () => {
      const result = await dismissRescheduleRequestAction(locale, a.id);
      if (result?.error) return fail(result.error);
      toast.success(t("toast.kept"));
      onClose();
    });
  }

  function retrySync() {
    startTransition(async () => {
      const result = await retryGoogleSyncAction(locale, a.id);
      if (result?.error) return fail(result.error);
      toast.success(t("sync.retrying"));
    });
  }

  function cancel() {
    startTransition(async () => {
      const result = await cancelAppointmentAction(locale, a.id, reason);
      if (result?.error) return fail(result.error);
      toast.success(a.status === "requested" ? t("toast.declined") : t("toast.cancelled"));
      setCancelling(false);
      setReason("");
      onClose();
    });
  }

  const Icon = a.type === "online" ? Video : MapPin;

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">{a.clientName}</span>
              <StatusBadge status={a.status} />
            </DialogTitle>
          </DialogHeader>

          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex flex-col">
              <dt className="text-muted-foreground">{t("detail.when")}</dt>
              <dd>{formatRange(a.startsAt, a.endsAt, locale, timeZone)}</dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-muted-foreground">{t("detail.where")}</dt>
              <dd className="flex items-center gap-1.5">
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words" dir="auto">
                  {a.location || t(`type.${a.type}`)}
                </span>
              </dd>
            </div>
            {a.notes && (
              <div className="flex flex-col">
                <dt className="text-muted-foreground">{t("detail.notes")}</dt>
                <dd className="whitespace-pre-wrap" dir="auto">{a.notes}</dd>
              </div>
            )}
            {a.cancelReason && (
              <div className="flex flex-col">
                <dt className="text-muted-foreground">{t("detail.cancelReason")}</dt>
                <dd dir="auto">{a.cancelReason === "google_removed" ? t("detail.removedInGoogle") : a.cancelReason}</dd>
              </div>
            )}
            {a.rescheduleRequestedAt && live && (
              <div className="rounded-lg bg-warning-tint p-2.5 text-warning-tint-foreground">
                <p className="font-medium">{t("detail.rescheduleRequested")}</p>
                {a.rescheduleNote && <p dir="auto">{a.rescheduleNote}</p>}
                <Button size="sm" variant="outline" className="mt-2 me-2" disabled={pending} onClick={keepOriginal}>
                  {t("detail.keepOriginal")}
                </Button>
                {a.proposedStartsAt && a.proposedEndsAt && (
                  <>
                    <p className="mt-1">
                      {t("detail.proposedTime", { when: formatRange(a.proposedStartsAt, a.proposedEndsAt, locale, timeZone) })}
                    </p>
                    <Button size="sm" className="mt-2" disabled={pending} onClick={acceptProposal}>
                      {t("detail.acceptProposed")}
                    </Button>
                  </>
                )}
              </div>
            )}
            {syncState && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <SyncIcon state={syncState} />
                <span>{t(`sync.${syncState}Long`)}</span>
                {syncState === "failed" && (
                  <Button size="sm" variant="outline" disabled={pending} onClick={retrySync}>
                    {t("sync.retry")}
                  </Button>
                )}
              </div>
            )}
          </dl>

          <div className="flex flex-wrap gap-2">
            {a.status === "requested" && (
              <Button disabled={pending} onClick={() => transition("confirm", t("toast.confirmed"))}>
                {t("detail.confirm")}
              </Button>
            )}
            {live && (
              <Button variant="outline" disabled={pending} onClick={() => onReschedule(a)}>
                {t("detail.reschedule")}
              </Button>
            )}
            {a.status === "confirmed" && started && (
              <>
                <Button variant="outline" disabled={pending} onClick={() => transition("complete", t("toast.completed"))}>
                  {t("detail.complete")}
                </Button>
                <Button variant="outline" disabled={pending} onClick={() => transition("no_show", t("toast.noShow"))}>
                  {t("detail.noShow")}
                </Button>
              </>
            )}
            {live && (
              <Button variant="destructive" disabled={pending} onClick={() => setCancelling(true)}>
                {a.status === "requested" ? t("detail.decline") : t("detail.cancel")}
              </Button>
            )}
            {a.status !== "cancelled" && (
              <Button variant="ghost" nativeButton={false} render={<a href={`/api/appointments/${a.id}/ics`} download />}>
                <CalendarPlus className="size-4" />
                {t("detail.addToCalendar")}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelling} onOpenChange={setCancelling}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{a.status === "requested" ? t("detail.declineTitle") : t("detail.cancelTitle")}</DialogTitle>
            <DialogDescription>{t("detail.reasonHint")}</DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            dir="auto"
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            aria-label={t("detail.cancelReason")}
          />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{tCommon("cancel")}</DialogClose>
            <Button variant="destructive" onClick={cancel} disabled={pending} className="min-w-24">
              {pending ? tCommon("pending") : a.status === "requested" ? t("detail.decline") : t("detail.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
