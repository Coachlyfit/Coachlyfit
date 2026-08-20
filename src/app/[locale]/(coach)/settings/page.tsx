import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/lib/auth/sign-out-action";
import { PageTitle } from "@/components/dashboard/page-title";

export default async function SettingsPage({
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
  const { data: coach } = await supabase
    .from("coaches")
    .select("business_name")
    .eq("id", user!.id)
    .single();

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("title")} />
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-base">{t("account")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">{t("businessName")}</span>
            <span className="text-sm font-medium">{coach?.business_name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">{t("email")}</span>
            <span className="text-sm font-medium">{user?.email}</span>
          </div>
          <form action={signOutAction.bind(null, locale)}>
            <Button type="submit" variant="outline" className="w-full">
              {t("signOut")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
