import { useTranslations } from "next-intl";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import type { TicketStatus } from "@/domain/support/support";

const TONE: Record<TicketStatus, StatusTone> = {
  open: "accent",
  in_progress: "warning",
  waiting_on_coach: "warning",
  closed: "success",
};

/** The one status whose wording depends on who reads it: "waiting for your
 * reply" to the coach, "waiting on coach" to an admin. */
export function useTicketStatusLabel(viewer: "coach" | "admin") {
  const t = useTranslations("support.status");
  const tAdmin = useTranslations("admin.support");
  return (status: string) =>
    viewer === "admin" && status === "waiting_on_coach" ? tAdmin("waitingOnCoach") : t.has(status) ? t(status) : status;
}

export function TicketStatusBadge({ status, viewer }: { status: string; viewer: "coach" | "admin" }) {
  const label = useTicketStatusLabel(viewer);
  return <StatusBadge tone={TONE[status as TicketStatus] ?? "accent"}>{label(status)}</StatusBadge>;
}
