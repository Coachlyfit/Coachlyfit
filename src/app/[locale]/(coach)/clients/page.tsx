import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ClientsService } from "@/domain/clients/clients.service";
import { AVATARS_BUCKET } from "@/domain/avatars/avatar.service";
import { subscriptionRosterStatus } from "@/domain/billing/client-subscription";
import { clientCheckinStatus, daysSince } from "@/domain/progress/stats";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatNumber } from "@/lib/format";
import { PageTitle } from "@/components/dashboard/page-title";
import { InviteClientDialog } from "./invite-client-dialog";
import { ClientsTable, type ClientRow } from "./clients-table";
import { STATUS_FILTERS, type StatusFilter } from "./schemas";

export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status: rawStatus } = await searchParams;
  const t = await getTranslations("clients");
  const supabase = await createClient();

  // Unknown values from a hand-edited URL fall back to "all", not an error.
  const status: StatusFilter = STATUS_FILTERS.includes(rawStatus as StatusFilter) ? (rawStatus as StatusFilter) : "all";

  const roster = await new ClientsService(supabase).listRoster();
  const now = new Date();

  // Avatar bucket is public, so getPublicUrl is enough to render it.
  const avatarUrl = (path: string | null) =>
    path ? supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path).data.publicUrl : null;

  const rows: ClientRow[] = roster.map((client) => ({
    id: client.id,
    name: client.displayName,
    email: client.email,
    avatarUrl: avatarUrl(client.avatarUrl),
    invited: client.status === "invited",
    program: client.program ? pickLocale(client.program, locale) : null,
    lastCheckin: client.lastCheckin,
    daysAgo: client.lastCheckin ? daysSince(client.lastCheckin, now) : null,
    adherence: client.adherence,
    checkinStatus: client.status === "archived" ? "archived" : clientCheckinStatus(client.lastCheckin, now),
    subscription: subscriptionRosterStatus(client.subscription, now),
  }));

  const current = rows.filter((row) => row.checkinStatus !== "archived");
  const needFollowUp = current.filter((row) => row.checkinStatus !== "active").length;
  const num = (chunks: React.ReactNode) => <span className="font-mono tabular-nums">{chunks}</span>;

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={t("title")} />

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl leading-9 font-semibold">{t("heading")}</h1>
          {current.length > 0 && (
            <p className="text-base text-muted-foreground">
              {needFollowUp === 0
                ? t("summaryAllClear")
                : t.rich("summary", {
                    need: formatNumber(needFollowUp, locale),
                    total: formatNumber(current.length, locale),
                    num,
                    strong: (chunks) => (
                      <span className="font-mono font-semibold text-foreground tabular-nums">{chunks}</span>
                    ),
                  })}
            </p>
          )}
        </div>
        <InviteClientDialog locale={locale} />
      </header>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            brandMark
            title={t("emptyTitle")}
            description={t("empty")}
            action={<InviteClientDialog locale={locale} />}
          />
        </Card>
      ) : (
        <ClientsTable locale={locale} clients={rows} status={status} />
      )}
    </div>
  );
}
