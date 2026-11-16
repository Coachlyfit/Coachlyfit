"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppointmentDialog } from "@/components/appointments/appointment-dialog";

/** "Schedule a session" for this one client: the shared create dialog with the
 * client fixed. */
export function ScheduleAppointmentButton({
  client,
  timeZone,
}: {
  client: { id: string; display_name: string };
  timeZone: string;
}) {
  const t = useTranslations("appointments");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CalendarPlus className="size-4" />
        {t("newAppointment")}
      </Button>
      <AppointmentDialog
        open={open}
        onOpenChange={setOpen}
        clients={[client]}
        timeZone={timeZone}
        defaultClientId={client.id}
      />
    </>
  );
}
