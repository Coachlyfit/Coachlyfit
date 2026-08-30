import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { signOutAction } from "@/lib/auth/sign-out-action";
import { PageTitle } from "@/components/dashboard/page-title";
import { CheckinTemplatePicker } from "@/components/settings/checkin-template-picker";
import { PackagesCard } from "@/components/settings/packages-card";
import { PaymentMethodsCard } from "@/components/settings/payment-methods-card";
import { CustomMetricsCard } from "@/components/settings/custom-metrics-card";
import { TeamCard } from "@/components/settings/team-card";
import { PortalCard } from "@/components/settings/portal-card";
import { ClientBillingService } from "@/domain/billing/client-billing.service";
import { MetricDefinitionsService } from "@/domain/progress/metric-definitions.service";
import { TeamService } from "@/domain/team/team.service";

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
  const coachId = await resolveCoachId(supabase);
  if (!coachId) notFound();

  const { data: coach } = await supabase
    .from("coaches")
    .select("business_name, default_checkin_template_id, slug")
    .eq("id", coachId)
    .single();

  // Only published (current_version_id set) checkin-kind templates are
  // usable for auto-assignment — an unpublished template has no schema to
  // assign yet.
  const { data: checkinTemplates } = await supabase
    .from("form_templates")
    .select("id, name_ar, name_en")
    .eq("kind", "checkin")
    .not("current_version_id", "is", null)
    .order("name_en");

  const billing = new ClientBillingService(supabase);
  const [packages, paymentMethods, customMetrics, teamMembers] = await Promise.all([
    billing.listPackages(coachId),
    billing.listPaymentMethods(coachId),
    new MetricDefinitionsService(supabase).list(coachId),
    new TeamService(supabase).list(coachId),
  ]);

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
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-base">{t("checkinTemplateTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t("checkinTemplateHint")}</p>
          <CheckinTemplatePicker
            templates={checkinTemplates ?? []}
            defaultTemplateId={coach?.default_checkin_template_id ?? null}
          />
        </CardContent>
      </Card>
      <PackagesCard packages={packages} />
      <PaymentMethodsCard methods={paymentMethods} />
      <CustomMetricsCard metrics={customMetrics} />
      <TeamCard members={teamMembers} />
      <PortalCard slug={coach?.slug ?? ""} />
    </div>
  );
}
