import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { signOutAction } from "@/lib/auth/sign-out-action";
import { PageTitle } from "@/components/dashboard/page-title";
import { TeamCard } from "@/components/settings/team-card";
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

  const [{ data: profile }, teamMembers] = await Promise.all([
    supabase.from("profiles").select("email_notifications").eq("id", user.id).single(),
    new TeamService(supabase).list(coachId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title={t("accountAndTeam")} />
      <Link
        href="/settings"
        className="flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <ArrowRight className="size-4 rotate-180 rtl:rotate-0" aria-hidden="true" />
        {t("backToSettings")}
      </Link>
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
        <TeamCard members={teamMembers} />
      </div>
    </div>
  );
}
