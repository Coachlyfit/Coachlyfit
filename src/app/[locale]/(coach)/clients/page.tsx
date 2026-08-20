import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { adherenceAverage, lastCheckinDate } from "@/domain/progress/stats";
import type { AppLocale } from "@/domain/locale";
import { PageTitle } from "@/components/dashboard/page-title";
import { InviteClientDialog } from "./invite-client-dialog";
import { ClientsTable } from "./clients-table";

// A client is "late" if their most recent check-in is older than this, or
// they have none at all. Matches the design's "متأخر" filter.
const LATE_AFTER_DAYS = 7;
const RECENT_CHECKIN_WINDOW_DAYS = 90;

export default async function ClientsPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("clients");
  const supabase = await createClient();

  const since = new Date(new Date().getTime() - RECENT_CHECKIN_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [{ data: clients }, { data: checkins }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, display_name, email, phone, status, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("checkins")
      .select("client_id, checkin_date, adherence")
      .gte("checkin_date", since),
  ]);

  const checkinsByClient = new Map<string, typeof checkins>();
  for (const row of checkins ?? []) {
    const bucket = checkinsByClient.get(row.client_id);
    if (bucket) bucket.push(row);
    else checkinsByClient.set(row.client_id, [row]);
  }

  const lateCutoff = new Date(new Date().getTime() - LATE_AFTER_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const rows = (clients ?? []).map((client) => {
    const clientCheckins = checkinsByClient.get(client.id) ?? [];
    const lastActive = lastCheckinDate(clientCheckins);
    return {
      ...client,
      adherence: adherenceAverage(clientCheckins),
      lastActive,
      isLate: client.status === "active" && (!lastActive || lastActive < lateCutoff),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("title")} />
      <div className="flex items-center justify-end">
        <InviteClientDialog locale={locale} />
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{t("empty")}</CardContent>
        </Card>
      ) : (
        <ClientsTable locale={locale} clients={rows} />
      )}
    </div>
  );
}
