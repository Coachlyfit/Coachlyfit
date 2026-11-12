import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { signOutAction } from "@/lib/auth/sign-out-action";
import { PageTitle } from "@/components/dashboard/page-title";
import { TeamCard } from "@/components/settings/team-card";
import { SettingsTabsBar } from "@/components/settings/settings-tabs-bar";
import { EmailNotificationsToggle } from "@/components/settings/email-notifications-toggle";
import { ChangeEmailForm } from "@/components/settings/change-email-form";
import { TeamService } from "@/domain/team/team.service";

export default async function AccountSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("settings");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const coachId = await resolveCoachId(supabase);
  if (!user || !coachId) notFound();

  const team = new TeamService(supabase);
  const [{ data: profile }, teamMembers, seats] = await Promise.all([
    supabase.from("profiles").select("email_notifications").eq("id", user.id).single(),
    team.list(coachId),
    team.seats(),
  ]);
  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title={t("accountAndTeam")} />
      {/* Members have no other settings page, so no tab bar for them. */}
      {user.id === coachId && <SettingsTabsBar />}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("account")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ChangeEmailForm currentEmail={user.email ?? ""} />
            <EmailNotificationsToggle locale={locale} enabled={profile?.email_notifications ?? true} />
            <form action={signOutAction.bind(null, locale)}>
              <Button type="submit" variant="outline" className="w-full">
                {t("signOut")}
              </Button>
            </form>
          </CardContent>
        </Card>
        <TeamCard
          members={teamMembers.map((member) => ({
            id: member.id,
            email: member.email,
            accepted_at: member.accepted_at,
            // An invite past its expiry can't be accepted and holds no seat.
            expired: !member.accepted_at && new Date(member.expires_at) <= now,
          }))}
          seats={seats}
          isOwner={user.id === coachId}
        />
      </div>
    </div>
  );
}
