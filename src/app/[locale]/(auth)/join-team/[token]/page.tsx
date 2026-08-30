import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TeamJoinForm } from "./team-join-form";

// ponytail: no upfront get_invite_info-style validity check -- there's no
// team-invite equivalent RPC (deliberately skipped to avoid another public
// security-definer surface). An invalid/expired/used token surfaces as
// "invalid_invite" from accept_team_invite after submit instead. That's a
// UX-only difference from join/[token]/page.tsx (which shows a "this link
// isn't valid" card before the user types anything) -- both paths are
// equally secure since acceptance is enforced server-side either way.
export default async function JoinTeamPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  const t = await getTranslations("join.team");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("heading")}</CardTitle>
      </CardHeader>
      <CardContent>
        <TeamJoinForm locale={locale} token={token} />
      </CardContent>
    </Card>
  );
}
