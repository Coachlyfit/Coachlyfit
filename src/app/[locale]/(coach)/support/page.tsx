import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, getRequestCoachId } from "@/lib/auth/session";
import { formatRelativeTime } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { PageTitle } from "@/components/dashboard/page-title";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { SupportService } from "@/domain/support/support.service";
import type { AppLocale } from "@/domain/locale";
import { Link } from "@/i18n/navigation";
import { NewTicketDialog } from "./new-ticket-dialog";

/** The tenant owner's tickets to the platform team. Owner only: a team
 * member has no nav item for this, gets a 404 here, and RLS on
 * support_tickets would show them nothing anyway. */
export default async function SupportPage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  const t = await getTranslations("support");

  const [user, coachId] = await Promise.all([getAuthUser(), getRequestCoachId()]);
  if (!user || coachId !== user.id) notFound();

  const tickets = await new SupportService(await createClient()).list();

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={t("title")} />
      <AutoRefresh />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        <NewTicketDialog locale={locale} coachId={coachId} />
      </div>

      <section aria-label={t("title")} className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {tickets.length === 0 ? (
          <EmptyState brandMark title={t("emptyTitle")} description={t("empty")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-background text-muted-foreground hover:bg-background">
                <TableHead>{t("table.subject")}</TableHead>
                <TableHead>{t("table.category")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead>{t("table.updated")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="max-w-72">
                    <Link
                      href={`/support/${ticket.id}`}
                      className="flex min-h-11 items-center gap-2 font-semibold underline-offset-4 hover:underline"
                    >
                      {ticket.coach_unread && (
                        <span role="img" aria-label={t("unread")} className="size-2 shrink-0 rounded-full bg-primary" />
                      )}
                      <span className="truncate">{ticket.subject}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{t(`category.${ticket.category}`)}</TableCell>
                  <TableCell>
                    <TicketStatusBadge status={ticket.status} viewer="coach" />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatRelativeTime(ticket.last_message_at, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
