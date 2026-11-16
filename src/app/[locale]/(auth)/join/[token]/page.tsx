import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { GoogleAuthSection } from "@/components/auth/google-auth-section";
import { JoinForm } from "./join-form";

type InviteInfo = {
  valid: boolean;
  business_name?: string;
  display_name?: string;
  email?: string;
};

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ locale, token }, { error }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_invite_info", { p_token: token });
  const info = data as InviteInfo | null;

  if (!info?.valid) {
    const t = await getTranslations("join.invalid");
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("body")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const t = await getTranslations("join.form");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("invitedBy", { business: info.business_name ?? "" })}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <JoinForm
          locale={locale}
          token={token}
          defaultFullName={info.display_name}
          defaultEmail={info.email}
        />
        <GoogleAuthSection
          locale={locale}
          intent="client_invite"
          inviteToken={token}
          next={`/${locale}/c`}
          error={error}
        />
      </CardContent>
    </Card>
  );
}
