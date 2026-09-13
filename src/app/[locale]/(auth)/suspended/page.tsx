import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/sign-out-action";
import { getPlatformSettings } from "@/lib/platform-settings";

export default async function SuspendedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("auth.suspended");
  const settings = await getPlatformSettings();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("body", { email: settings.branding.support_email })}</CardDescription>
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
