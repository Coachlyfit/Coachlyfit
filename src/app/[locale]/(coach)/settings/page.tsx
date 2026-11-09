import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getBranding } from "@/lib/branding";
import { getFeatures } from "@/lib/features";
import { getAuthUser } from "@/lib/auth/session";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { AVATARS_BUCKET } from "@/domain/avatars/avatar.service";
import { PageTitle } from "@/components/dashboard/page-title";
import { SettingsShell } from "@/components/settings/settings-shell";
import { ClientBillingService } from "@/domain/billing/client-billing.service";
import { MetricDefinitionsService } from "@/domain/progress/metric-definitions.service";
import type { InvoiceCurrency } from "@/domain/billing/invoices";

// Account, team and sign-out live on ./account -- this page is only what
// the client ends up seeing (identity, billing, packages, portal).
export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const supabase = await createClient();

  const coachId = await resolveCoachId(supabase);
  if (!coachId) notFound();

  const user = await getAuthUser();
  let avatarUrl: string | null = null;
  if (user) {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    avatarUrl = profileRow?.avatar_url
      ? supabase.storage.from(AVATARS_BUCKET).getPublicUrl(profileRow.avatar_url).data.publicUrl
      : null;
  }

  const billing = new ClientBillingService(supabase);
  const [{ data: coach }, { data: checkinTemplates }, packages, paymentMethods, customMetrics, branding, features] = await Promise.all([
    supabase
      .from("coaches")
      .select(
        "business_name, default_checkin_template_id, slug, logo_path, address, tax_number, contact_phone, contact_email, default_currency, default_tax_rate, brand_primary, brand_accent, brand_sidebar, brand_sidebar_text"
      )
      .eq("id", coachId)
      .single(),
    // Only published (current_version_id set) checkin-kind templates are
    // usable for auto-assignment — an unpublished template has no schema to
    // assign yet.
    supabase
      .from("form_templates")
      .select("id, name_ar, name_en")
      .eq("kind", "checkin")
      .not("current_version_id", "is", null)
      .is("archived_at", null)
      .order("name_en"),
    billing.listPackages(coachId),
    billing.listPaymentMethods(coachId),
    new MetricDefinitionsService(supabase).list(coachId),
    // Non-null exactly when the plan includes custom branding.
    getBranding(),
    getFeatures(),
  ]);
  if (!coach) notFound();

  return (
    <>
      <PageTitle title={t("title")} subtitle={t("subtitle")} />
      <SettingsShell
        coachId={coachId}
        userId={user?.id ?? ""}
        avatarUrl={avatarUrl}
        profile={{
          business_name: coach.business_name,
          address: coach.address ?? "",
          tax_number: coach.tax_number ?? "",
          contact_phone: coach.contact_phone ?? "",
          contact_email: coach.contact_email ?? "",
          default_currency: coach.default_currency as InvoiceCurrency,
          // A string, as the number input reports it, so retyping the saved
          // value doesn't leave the form dirty.
          default_tax_rate: String(coach.default_tax_rate),
          logo_path: coach.logo_path,
        }}
        portal={{ slug: coach.slug, default_checkin_template_id: coach.default_checkin_template_id }}
        brand={{
          brand_primary: coach.brand_primary ?? "",
          brand_accent: coach.brand_accent ?? "",
          brand_sidebar: coach.brand_sidebar ?? "",
          brand_sidebar_text: coach.brand_sidebar_text ?? "",
        }}
        brandingEnabled={branding !== null}
        whiteLabelEnabled={features.white_label}
        checkinTemplates={checkinTemplates ?? []}
        packages={packages}
        paymentMethods={paymentMethods}
        customMetrics={customMetrics}
      />
    </>
  );
}
