import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/lib/auth/sign-out-action";
import { getPlatformSettings } from "@/lib/platform-settings";

export default async function ExpiredPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("auth.expired");
  const settings = await getPlatformSettings();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: clientRow } = user
    ? await supabase.from("clients").select("coaches(business_name)").eq("profile_id", user.id).maybeSingle()
    : { data: null };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {clientRow?.coaches?.business_name
            ? t("bodyWithCoach", { coach: clientRow.coaches.business_name })
            : t("body", { email: settings.branding.support_email })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={signOutAction.bind(null, locale)}>
          <Button type="submit" variant="outline" className="w-full">
            {t("signOut")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
