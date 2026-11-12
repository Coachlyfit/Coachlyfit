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
import { ImportDialog } from "@/components/import/import-dialog";
import { InviteClientDialog } from "./invite-client-dialog";
import { ClientsTable, type ClientRow } from "./clients-table";
import { STATUS_FILTERS, type StatusFilter } from "./schemas";
import { getAuthUser, getRequestCoachId } from "@/lib/auth/session";

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

  const [user, coachId, roster] = await Promise.all([
    getAuthUser(),
    getRequestCoachId(),
    new ClientsService(supabase).listRoster(),
  ]);
  const isOwner = !!(user && coachId && user.id === coachId);

  // Team directory: only fetched for the owner, used to populate the assign select.
  let team: { id: string; name: string; isOwner: boolean }[] = [];
  if (isOwner) {
    const { data } = await supabase.rpc("get_team_directory");
    team = (data ?? []).map((r: { profile_id: string; display_name: string; is_owner: boolean }) => ({
      id: r.profile_id,
      name: r.display_name,
      isOwner: r.is_owner,
    }));
  }
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
    assignedTo: client.assignedTo,
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
        <div className="flex items-center gap-2">
          <ImportDialog type="clients" locale={locale} />
          <InviteClientDialog locale={locale} />
        </div>
      </header>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            brandMark
            title={isOwner ? t("emptyTitle") : t("memberEmptyTitle")}
            description={isOwner ? t("empty") : t("memberEmpty")}
            action={
              isOwner ? (
                <div className="flex items-center gap-2">
                  <ImportDialog type="clients" locale={locale} />
                  <InviteClientDialog locale={locale} />
                </div>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ClientsTable locale={locale} clients={rows} status={status} isOwner={isOwner} team={team} />
      )}
    </div>
  );
}
