import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { MarkTicketRead } from "@/components/support/mark-ticket-read";
import { TicketReplyForm } from "@/components/support/ticket-reply-form";
import { TicketThread } from "@/components/support/ticket-thread";
import { SupportService } from "@/domain/support/support.service";
import type { AppLocale } from "@/domain/locale";
import { Link } from "@/i18n/navigation";
import { StatusSelect } from "../status-select";

/** One ticket, for an admin: the conversation including internal notes, the
 * status control, and a composer that can answer the coach or leave a note.
 * Admin-only through the (admin) layout and RLS. */
export default async function AdminSupportTicketPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; ticketId: string }>;
}) {
  const { locale, ticketId } = await params;
  const t = await getTranslations("admin.support");
  const tSupport = await getTranslations("support");
  const supabase = await createClient();
  const service = new SupportService(supabase);

  // A malformed id in the URL is a Postgres error, not an empty result.
  const ticket = await service.get(ticketId).catch(() => null);
  if (!ticket) notFound();

  const [messages, { data: coaches }] = await Promise.all([
    service.messages(ticket.id),
    supabase.rpc("admin_list_coaches"),
  ]);
  const urls = await service.signAttachments(messages.flatMap((message) => message.attachment_paths));
  const coachName =
    (coaches ?? []).find((coach) => coach.coach_id === ticket.coach_id)?.business_name ?? t("unknownCoach");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 font-sans">
      <AutoRefresh />
      {ticket.admin_unread && <MarkTicketRead ticketId={ticket.id} />}

      <Link
        href="/admin/support"
        className="flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <ArrowRight className="size-4 rotate-180 rtl:rotate-0" aria-hidden="true" />
        {tSupport("back")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight break-words">{ticket.subject}</h1>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <Link href={`/admin/coaches/${ticket.coach_id}`} className="font-medium text-primary underline-offset-4 hover:underline">
              {coachName}
            </Link>
            <span aria-hidden="true">·</span>
            <span>
              {tSupport.has(`category.${ticket.category}`) ? tSupport(`category.${ticket.category}`) : ticket.category}
            </span>
          </p>
        </div>
        <StatusSelect locale={locale} ticketId={ticket.id} status={ticket.status} />
      </div>

      <TicketThread
        viewer="admin"
        locale={locale}
        coachName={coachName}
        messages={messages.map((message) => ({
          id: message.id,
          senderRole: message.sender_role,
          body: message.body,
          isInternal: message.is_internal,
          createdAt: message.created_at,
          attachments: message.attachment_paths.map((path) => urls[path]).filter((url) => url !== undefined),
        }))}
      />

      <TicketReplyForm locale={locale} ticketId={ticket.id} coachId={ticket.coach_id} side="admin" />
    </div>
  );
}
