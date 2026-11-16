import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthUser } from "@/lib/auth/session";
import { GoogleAuthSection } from "@/components/auth/google-auth-section";
import { TeamJoinForm, TeamAcceptButton } from "./team-join-form";

// ponytail: no upfront get_invite_info-style validity check -- there's no
// team-invite equivalent RPC (deliberately skipped to avoid another public
// security-definer surface). An invalid/expired/used token surfaces as
// "invalid_invite" after submit instead. That's a UX-only difference from
// join/[token]/page.tsx (which shows a "this link isn't valid" card before
// the user types anything) -- both paths are equally secure since acceptance
// is enforced server-side either way (private.claim_team_invite).
export default async function JoinTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ locale, token }, { error }] = await Promise.all([params, searchParams]);
  const [t, user] = await Promise.all([getTranslations("join.team"), getAuthUser()]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("heading")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {user?.email ? (
          <TeamAcceptButton locale={locale} token={token} email={user.email} />
        ) : (
          <>
            <TeamJoinForm locale={locale} token={token} />
            <GoogleAuthSection
              locale={locale}
              intent="team_invite"
              inviteToken={token}
              next={`/${locale}/join-team/${token}`}
              error={error}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
