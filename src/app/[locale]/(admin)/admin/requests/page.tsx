import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { RequestsList } from "./requests-list";

/** Inbox of coach subscription requests. Rows are admin-readable through RLS
 * (private.is_admin()); coach names come from admin_list_coaches() because
 * an admin has no direct read on public.coaches. */
export default async function AdminRequestsPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("admin.requests");
  const supabase = await createClient();

  const [{ data: requests }, { data: coaches }] = await Promise.all([
    supabase
      .from("subscription_requests")
      .select("id, coach_id, type, note, status, admin_response, created_at, subscription_tiers(name_ar, name_en)")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.rpc("admin_list_coaches"),
  ]);

  const names = new Map((coaches ?? []).map((coach) => [coach.coach_id, coach.business_name]));
  const rows = (requests ?? [])
    .map((row) => ({
      id: row.id,
      coachId: row.coach_id,
      coachName: names.get(row.coach_id) ?? row.coach_id,
      type: row.type,
      tierName: row.subscription_tiers ? pickLocale(row.subscription_tiers, locale) : null,
      note: row.note,
      status: row.status,
      adminResponse: row.admin_response,
      createdAt: row.created_at,
    }))
    // Pending first; the query already ordered each group newest first.
    .sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <Card>
        <CardContent>
          <RequestsList locale={locale} requests={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
