import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { AppLocale } from "@/domain/locale";
import { LeadsService } from "@/domain/leads/leads.service";
import { LeadsClient } from "./leads-client";

/** Prospective coaches: people with no account whom the admin emails from
 * /admin/emails. Admin-only through the (admin) layout and RLS on `leads`. */
export default async function AdminLeadsPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("admin.leads");
  const leads = await new LeadsService(await createClient()).list();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <LeadsClient locale={locale} leads={leads} />
    </div>
  );
}
