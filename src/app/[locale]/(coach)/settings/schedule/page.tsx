import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, getRequestCoachId } from "@/lib/auth/session";
import { getFeatures } from "@/lib/features";
import { PageTitle } from "@/components/dashboard/page-title";
import { UpgradePrompt } from "@/components/dashboard/upgrade-prompt";
import { SettingsTabsBar } from "@/components/settings/settings-tabs-bar";
import { ScheduleSettings } from "@/components/settings/schedule-settings";
import { GoogleCard, type GoogleConnectionView } from "@/components/settings/google-card";
import { FeedCard } from "@/components/appointments/feed-card";
import { AvailabilityService } from "@/domain/appointments/availability.service";
import { FeedService } from "@/domain/appointments/feed.service";
import { DEFAULT_TIME_ZONE, isValidTimeZone, localDateTime } from "@/domain/appointments/tz";
import { rotateFeedTokenAction } from "../schedule-actions";

// Owner-only, like the rest of /settings: availability and the cancel cutoff
// are tenant config. Members use the Schedule page.
export default async function ScheduleSettingsPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const { google } = await searchParams;
  const t = await getTranslations("appointments");

  const [user, coachId, features] = await Promise.all([getAuthUser(), getRequestCoachId(), getFeatures()]);
  if (!user || !coachId || user.id !== coachId) notFound();

  const supabase = await createClient();

  if (!features.appointments) {
    // A downgraded coach can still disconnect Google (and so remove the stored token).
    const { data: leftover } = await supabase.from("google_connections").select("status, google_email, last_sync_at").maybeSingle();
    return (
      <div className="flex flex-col gap-4">
        <PageTitle title={t("settings.title")} />
        <SettingsTabsBar />
        <Card>
          <CardContent>
            <UpgradePrompt feature="appointments" />
          </CardContent>
        </Card>
        {leftover && (
          <GoogleCard
            connection={{ status: leftover.status as GoogleConnectionView["status"], email: leftover.google_email, lastSyncAt: leftover.last_sync_at }}
            configured={false}
            result={google ?? null}
          />
        )}
      </div>
    );
  }

  const availability = new AvailabilityService(supabase);
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const timeZone = profile?.timezone && isValidTimeZone(profile.timezone) ? profile.timezone : DEFAULT_TIME_ZONE;

  const [rules, exceptions, settings, feedToken, { data: connection }] = await Promise.all([
    availability.rules(coachId),
    availability.exceptions(coachId, localDateTime(new Date(), timeZone).date),
    availability.settings(coachId),
    new FeedService(supabase).token(user.id),
    // Named columns: the token column isn't selectable by a user session.
    supabase.from("google_connections").select("status, google_email, last_sync_at").maybeSingle(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title={t("settings.title")} />
      <SettingsTabsBar />
      <GoogleCard
        connection={
          connection
            ? { status: connection.status as GoogleConnectionView["status"], email: connection.google_email, lastSyncAt: connection.last_sync_at }
            : null
        }
        configured={!!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_TOKEN_ENCRYPTION_KEY)}
        result={google ?? null}
      />
      <ScheduleSettings rules={rules} exceptions={exceptions} settings={settings} timeZone={timeZone} />
      <Card>
        <CardContent>
          <FeedCard baseUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""} token={feedToken} rotate={rotateFeedTokenAction} />
        </CardContent>
      </Card>
    </div>
  );
}
