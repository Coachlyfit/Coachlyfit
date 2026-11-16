import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, getRequestCoachId } from "@/lib/auth/session";
import { getFeatures } from "@/lib/features";
import { PageTitle } from "@/components/dashboard/page-title";
import { UpgradePrompt } from "@/components/dashboard/upgrade-prompt";
import { toView } from "@/components/appointments/to-view";
import type { SyncState } from "@/components/appointments/shared";
import { AppointmentsService } from "@/domain/appointments/appointments.service";
import { DEFAULT_TIME_ZONE, addDays, isValidTimeZone, localDateTime, startOfDay, weekdayOf } from "@/domain/appointments/tz";
import type { AppLocale } from "@/domain/locale";
import { ScheduleView } from "./schedule-view";
import { GoogleReconnectBanner } from "./google-banner";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations("appointments");

  const [user, coachId, features] = await Promise.all([getAuthUser(), getRequestCoachId(), getFeatures()]);
  if (!user || !coachId) notFound();

  // The nav item is hidden on these plans; this is the direct-URL case.
  if (!features.appointments) {
    return (
      <div className="flex flex-col gap-5">
        <PageTitle title={t("title")} />
        <Card>
          <CardContent>
            <UpgradePrompt feature="appointments" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const timeZone = profile?.timezone && isValidTimeZone(profile.timezone) ? profile.timezone : DEFAULT_TIME_ZONE;

  const view = query.view === "day" ? "day" : "week";
  const today = localDateTime(new Date(), timeZone).date;
  const date = query.date && DATE.test(query.date) ? query.date : today;

  // Weeks start on Saturday in Arabic, Sunday in English (as the nutrition calendar does).
  const weekStartDay = locale === "ar" ? 6 : 0;
  const rangeStart = view === "day" ? date : addDays(date, -((weekdayOf(date) - weekStartDay + 7) % 7));
  const length = view === "day" ? 1 : 7;
  const from = startOfDay(rangeStart, timeZone);
  const to = startOfDay(addDays(rangeStart, length), timeZone);

  const service = new AppointmentsService(supabase);
  const [appointments, pending, rescheduling, { data: clients }, { data: google }] = await Promise.all([
    service.listRange(from, to),
    service.pendingRequests(),
    service.rescheduleRequests(),
    supabase.from("clients").select("id, display_name").neq("status", "archived").order("display_name"),
    // Owner only (RLS): a team member simply gets no row, so no banner.
    supabase.from("google_connections").select("status").maybeSingle(),
  ]);

  // Google sync state per appointment (empty when Google isn't connected).
  const ids = [...new Set([...appointments, ...pending, ...rescheduling].map((a) => a.id))];
  const { data: syncRows } = ids.length > 0 ? await supabase.rpc("appointment_sync_status", { p_ids: ids }) : { data: [] };
  const syncStates: Record<string, SyncState> = Object.fromEntries((syncRows ?? []).map((r) => [r.appointment_id, r.state as SyncState]));

  const step = view === "day" ? 1 : 7;
  const href = (target: string, v = view) => `/schedule?view=${v}&date=${target}`;

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={t("title")} />
      <ScheduleView
        view={view}
        date={date}
        rangeStart={rangeStart}
        today={today}
        timeZone={timeZone}
        appointments={appointments.map((a) => toView(a))}
        requests={[...pending, ...rescheduling].map((a) => toView(a))}
        clients={clients ?? []}
        syncStates={syncStates}
        banner={google && google.status !== "active" ? <GoogleReconnectBanner /> : undefined}
        hrefs={{
          prev: href(addDays(date, -step)),
          next: href(addDays(date, step)),
          today: href(today),
          day: href(date, "day"),
          week: href(date, "week"),
        }}
      />
    </div>
  );
}
