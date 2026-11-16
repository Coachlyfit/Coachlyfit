import { getTranslations } from "next-intl/server";
import { CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/session";
import { getFeatures } from "@/lib/features";
import { StatusBadge } from "@/components/appointments/shared";
import { formatRange } from "@/components/appointments/format";
import { AppointmentsService } from "@/domain/appointments/appointments.service";
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@/domain/appointments/tz";
import type { AppLocale } from "@/domain/locale";
import { ScheduleAppointmentButton } from "./schedule-appointment-button";

/** Next sessions and the last couple of finished ones for this client. Hidden
 * on plans without scheduling. */
export async function AppointmentsCard({
  clientId,
  clientName,
  locale,
}: {
  clientId: string;
  clientName: string;
  locale: AppLocale;
}) {
  if (!(await getFeatures()).appointments) return null;

  const t = await getTranslations("appointments");
  const supabase = await createClient();
  const user = await getAuthUser();
  const [rows, { data: profile }] = await Promise.all([
    new AppointmentsService(supabase).listForClient(clientId),
    user ? supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle() : { data: null },
  ]);
  const timeZone = profile?.timezone && isValidTimeZone(profile.timezone) ? profile.timezone : DEFAULT_TIME_ZONE;

  // One clock read up front, like attention-strip.tsx (the purity rule flags inline Date.now()).
  const now = new Date();
  const live = (a: (typeof rows)[number]) => (a.status === "requested" || a.status === "confirmed") && new Date(a.ends_at) > now;
  const upcoming = rows.filter(live).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 3);
  const past = rows.filter((a) => !live(a)).slice(0, 2);
  const shown = [...upcoming, ...past];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{t("profile.title")}</CardTitle>
        <ScheduleAppointmentButton client={{ id: clientId, display_name: clientName }} timeZone={timeZone} />
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <EmptyState icon={CalendarClock} title={t("profile.empty")} />
        ) : (
          <ul className="flex flex-col divide-y">
            {shown.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">{formatRange(a.starts_at, a.ends_at, locale, timeZone)}</span>
                <StatusBadge status={a.status as "requested" | "confirmed" | "cancelled" | "completed" | "no_show"} />
              </li>
            ))}
          </ul>
        )}
        <Link href="/schedule" className="mt-3 inline-block text-sm font-medium text-primary">
          {t("profile.openSchedule")}
        </Link>
      </CardContent>
    </Card>
  );
}
