"use client";

import type { ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** What the UI needs of an appointment. Plain data, so a server page can pass
 * it to client components. Times are ISO (UTC) strings. */
export type AppointmentView = {
  id: string;
  clientId: string;
  clientName: string;
  startsAt: string;
  endsAt: string;
  type: "online" | "in_person";
  status: "requested" | "confirmed" | "cancelled" | "completed" | "no_show";
  location: string | null;
  notes: string | null;
  cancelReason: string | null;
  rescheduleRequestedAt: string | null;
  rescheduleNote: string | null;
};

const VARIANT = {
  requested: "warning",
  confirmed: "success",
  cancelled: "outline",
  completed: "secondary",
  no_show: "destructive",
} as const;

export function StatusBadge({ status }: { status: AppointmentView["status"] }) {
  const t = useTranslations("appointments.status");
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>;
}

/** A plain <select> in the Input's clothes: the app's Select is a popover list,
 * too heavy for the short fixed lists in these forms. */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
        className
      )}
      {...props}
    />
  );
}
