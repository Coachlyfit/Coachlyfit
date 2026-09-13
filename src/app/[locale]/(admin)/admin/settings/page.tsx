import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PlatformSettingsService } from "@/domain/platform/settings.service";
import { PageTitle } from "@/components/dashboard/page-title";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneralTab } from "./general-tab";
import { PlatformTab } from "./platform-tab";
import { PlansTab } from "./plans-tab";
import { UsersTab } from "./users-tab";

export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("admin.settings");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [settings, tiersResult, usersResult] = await Promise.all([
    new PlatformSettingsService(supabase).getAll(),
    supabase.from("subscription_tiers").select("*").order("price_egp_monthly"),
    supabase.rpc("admin_list_users"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("title")} />
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">{t("tabs.general")}</TabsTrigger>
          <TabsTrigger value="platform">{t("tabs.platform")}</TabsTrigger>
          <TabsTrigger value="plans">{t("tabs.plans")}</TabsTrigger>
          <TabsTrigger value="users">{t("tabs.users")}</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralTab locale={locale} branding={settings.branding} announcement={settings.announcement} />
        </TabsContent>
        <TabsContent value="platform">
          <PlatformTab locale={locale} platform={settings.platform} billing={settings.billing} />
        </TabsContent>
        <TabsContent value="plans">
          <PlansTab locale={locale} tiers={tiersResult.data ?? []} />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab locale={locale} users={usersResult.data ?? []} currentUserId={user?.id ?? ""} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
