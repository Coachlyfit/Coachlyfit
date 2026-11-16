"use client";

import { useEffect, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, type AppointmentView } from "@/components/appointments/shared";
import { appointmentFormSchema, type AppointmentFormInput } from "@/domain/appointments/schemas";
import { localDateTime } from "@/domain/appointments/tz";
import {
  createAppointmentAction,
  rescheduleAppointmentAction,
} from "@/app/[locale]/(coach)/schedule/actions";

const DURATIONS = [30, 45, 60, 90, 120];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: { id: string; display_name: string }[];
  timeZone: string;
  /** Set to reschedule that appointment (client is then fixed). */
  editing?: AppointmentView | null;
  /** YYYY-MM-DD to start a new appointment on. */
  defaultDate?: string;
  defaultClientId?: string;
};

function defaultsFor(props: Pick<Props, "editing" | "defaultDate" | "defaultClientId" | "timeZone">): AppointmentFormInput {
  const { editing, defaultDate, defaultClientId, timeZone } = props;
  if (editing) {
    const local = localDateTime(new Date(editing.startsAt), timeZone);
    const minutes = Math.round((new Date(editing.endsAt).getTime() - new Date(editing.startsAt).getTime()) / 60_000);
    return {
      client_id: editing.clientId,
      date: local.date,
      time: local.time,
      duration_minutes: minutes,
      type: editing.type,
      location_or_link: editing.location ?? "",
      notes: editing.notes ?? "",
    };
  }
  return {
    client_id: defaultClientId ?? "",
    date: defaultDate ?? localDateTime(new Date(), timeZone).date,
    time: "10:00",
    duration_minutes: 60,
    type: "online",
    location_or_link: "",
    notes: "",
  };
}

export function AppointmentDialog(props: Props) {
  const { open, onOpenChange, clients, timeZone, editing } = props;
  const t = useTranslations("appointments");
  const tErrors = useTranslations("appointments.errors");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();

  const form = useForm<AppointmentFormInput>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: defaultsFor(props),
  });
  const { register, handleSubmit, control, reset, watch, formState: { errors } } = form;

  // Fresh values each time the dialog opens for a different target.
  useEffect(() => {
    if (open) reset(defaultsFor(props));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id, props.defaultDate, props.defaultClientId]);

  const type = watch("type");

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = editing
        ? await rescheduleAppointmentAction(locale, editing.id, data)
        : await createAppointmentAction(locale, data);
      if (result?.error) {
        toast.error(tErrors.has(result.error) ? tErrors(result.error) : tErrors("unknown"));
        return;
      }
      toast.success(editing ? t("toast.rescheduled") : t("toast.created"));
      onOpenChange(false);
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? t("form.rescheduleTitle") : t("form.createTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="appt_client">{t("form.client")}</Label>
            <NativeSelect id="appt_client" disabled={!!editing} {...register("client_id")}>
              <option value="">{t("form.selectClient")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </NativeSelect>
            {errors.client_id && <p className="text-sm text-destructive">{t("form.required")}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="appt_date">{t("form.date")}</Label>
              <Controller
                control={control}
                name="date"
                render={({ field }) => (
                  <DatePicker id="appt_date" value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!errors.date} />
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="appt_time">{t("form.time")}</Label>
              <Input id="appt_time" type="time" dir="ltr" {...register("time")} />
              {errors.time && <p className="text-sm text-destructive">{t("form.required")}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="appt_duration">{t("form.duration")}</Label>
              <NativeSelect id="appt_duration" {...register("duration_minutes", { valueAsNumber: true })}>
                {DURATIONS.map((m) => (
                  <option key={m} value={m}>
                    {t("form.minutes", { count: m })}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="appt_type">{t("form.type")}</Label>
              <NativeSelect id="appt_type" {...register("type")}>
                <option value="online">{t("type.online")}</option>
                <option value="in_person">{t("type.in_person")}</option>
              </NativeSelect>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="appt_location">{type === "online" ? t("form.link") : t("form.location")}</Label>
            <Input id="appt_location" dir="auto" {...register("location_or_link")} />
          </div>

          {!editing && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="appt_notes">{t("form.notes")}</Label>
              <Textarea id="appt_notes" rows={2} {...register("notes")} />
            </div>
          )}

          <p className="text-xs text-muted-foreground">{t("form.timeZoneHint", { timeZone })}</p>

          <Button type="submit" disabled={pending} className="min-w-24">
            {pending ? tCommon("pending") : editing ? t("form.save") : t("form.create")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
