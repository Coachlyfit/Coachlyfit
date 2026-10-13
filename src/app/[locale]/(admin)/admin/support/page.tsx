import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { SupportService } from "@/domain/support/support.service";
import type { AppLocale } from "@/domain/locale";
import { SupportInbox, type InboxRow } from "./support-inbox";

/** Every coach's support tickets. Admin-only through the (admin) layout and
 * RLS on support_tickets; coach names come from admin_list_coaches() because
 * an admin has no direct read on public.coaches. */
export default async function AdminSupportPage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  const t = await getTranslations("admin.support");
  const supabase = await createClient();

  const [tickets, { data: coaches }] = await Promise.all([
    new SupportService(supabase).list(),
    supabase.rpc("admin_list_coaches"),
  ]);

  const names = new Map((coaches ?? []).map((coach) => [coach.coach_id, coach.business_name]));
  const rows: InboxRow[] = tickets.map((ticket) => ({
    id: ticket.id,
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
    coachId: ticket.coach_id,
    coachName: names.get(ticket.coach_id) ?? t("unknownCoach"),
    lastMessageAt: ticket.last_message_at,
    unread: ticket.admin_unread,
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <AutoRefresh />
      <SupportInbox locale={locale} tickets={rows} />
    </div>
  );
}
