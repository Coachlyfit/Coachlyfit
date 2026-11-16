import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/session";
import { appOrigin } from "@/lib/app-origin";
import { EmptyState } from "@/components/ui/empty-state";
import { toView } from "@/components/appointments/to-view";
import { AppointmentsService } from "@/domain/appointments/appointments.service";
import { AvailabilityService } from "@/domain/appointments/availability.service";
import { FeedService } from "@/domain/appointments/feed.service";
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@/domain/appointments/tz";
import type { AppLocale } from "@/domain/locale";
import { SessionsView, type ClientAppointment } from "./sessions-view";

export default async function ClientAppointmentsPage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  await params;
  const t = await getTranslations("appointments");
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) notFound();

  // The (client) layout already redirected anyone without a linked row.
  const [{ data: client }, { data: profile }, { data: enabled }] = await Promise.all([
    supabase.from("clients").select("id, coach_id").eq("profile_id", user.id).maybeSingle(),
    supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle(),
    supabase.rpc("appointments_enabled"),
  ]);
  if (!client) notFound();

  // A client can't see plans, so a coach without scheduling just reads as "not available".
  if (!enabled) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t("client.title")}</h1>
        <EmptyState title={t("client.unavailable")} description={t("client.unavailableHint")} />
      </div>
    );
  }

  const timeZone = profile?.timezone && isValidTimeZone(profile.timezone) ? profile.timezone : DEFAULT_TIME_ZONE;
  const [rows, settings, feedToken] = await Promise.all([
    new AppointmentsService(supabase).listForClient(client.id),
    new AvailabilityService(supabase).settings(client.coach_id),
    new FeedService(supabase).token(user.id),
  ]);

  // One clock read up front (the purity rule flags inline Date.now()).
  const now = new Date();
  const all: ClientAppointment[] = rows.map((row) => ({
    ...toView(row),
    locked: new Date(row.starts_at).getTime() - settings.cancel_cutoff_hours * 3_600_000 < now.getTime(),
  }));
  const live = (a: ClientAppointment) => (a.status === "requested" || a.status === "confirmed") && new Date(a.endsAt) > now;
  const upcoming = all.filter(live).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = all.filter((a) => !live(a));

  return (
    <SessionsView
      upcoming={upcoming}
      past={past}
      timeZone={timeZone}
      cutoffHours={settings.cancel_cutoff_hours}
      feed={{ baseUrl: await appOrigin(), token: feedToken }}
    />
  );
}
