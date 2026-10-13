import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, getRequestCoachId } from "@/lib/auth/session";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { PageTitle } from "@/components/dashboard/page-title";
import { MarkTicketRead } from "@/components/support/mark-ticket-read";
import { TicketReplyForm } from "@/components/support/ticket-reply-form";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { TicketThread } from "@/components/support/ticket-thread";
import { REOPEN_WINDOW_DAYS, canReopen } from "@/domain/support/support";
import { SupportService } from "@/domain/support/support.service";
import type { AppLocale } from "@/domain/locale";
import { Link } from "@/i18n/navigation";
import { ReopenButton } from "../reopen-button";

/** One ticket's conversation, for its owner. A ticket that isn't theirs (or
 * doesn't exist) is the same 404: RLS returns no row either way. */
export default async function SupportTicketPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; ticketId: string }>;
}) {
  const { locale, ticketId } = await params;
  const t = await getTranslations("support");

  const [user, coachId] = await Promise.all([getAuthUser(), getRequestCoachId()]);
  if (!user || coachId !== user.id) notFound();

  const service = new SupportService(await createClient());
  // A malformed id in the URL is a Postgres error, not an empty result.
  const ticket = await service.get(ticketId).catch(() => null);
  if (!ticket) notFound();

  const messages = await service.messages(ticket.id);
  const urls = await service.signAttachments(messages.flatMap((message) => message.attachment_paths));
  const closed = ticket.status === "closed";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageTitle title={ticket.subject} subtitle={t(`category.${ticket.category}`)} />
      <AutoRefresh />
      {ticket.coach_unread && <MarkTicketRead ticketId={ticket.id} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/support"
          className="flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <ArrowRight className="size-4 rotate-180 rtl:rotate-0" aria-hidden="true" />
          {t("back")}
        </Link>
        <TicketStatusBadge status={ticket.status} viewer="coach" />
      </div>

      <TicketThread
        viewer="coach"
        locale={locale}
        messages={messages.map((message) => ({
          id: message.id,
          senderRole: message.sender_role,
          body: message.body,
          isInternal: message.is_internal,
          createdAt: message.created_at,
          attachments: message.attachment_paths.map((path) => urls[path]).filter((url) => url !== undefined),
        }))}
      />

      {closed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10">
          {canReopen(ticket, new Date()) ? (
            <>
              <p className="text-muted-foreground">{t("thread.closedNotice")}</p>
              <ReopenButton locale={locale} ticketId={ticket.id} />
            </>
          ) : (
            <p className="text-muted-foreground">{t("thread.reopenExpired", { days: REOPEN_WINDOW_DAYS })}</p>
          )}
        </div>
      ) : (
        <TicketReplyForm locale={locale} ticketId={ticket.id} coachId={ticket.coach_id} side="coach" />
      )}
    </div>
  );
}
