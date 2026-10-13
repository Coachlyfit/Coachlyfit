import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { AppLocale } from "@/domain/locale";
import { CampaignsService } from "@/domain/emails/campaigns.service";
import { LeadsService } from "@/domain/leads/leads.service";
import { EmailsClient } from "./emails-client";
import { HistoryList } from "./history-list";

/** Compose, preview and send an email to coaches, with the history of past
 * sends below. The coach list handed to the client carries ids, names and
 * subscription status only: addresses stay on the server and the send action
 * resolves them again from the ids. */
export default async function AdminEmailsPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("admin.emails");
  const supabase = await createClient();
  const service = new CampaignsService(supabase);

  const [recipients, history, allLeads] = await Promise.all([
    service.listRecipients(),
    service.listHistory(),
    new LeadsService(supabase).list(),
  ]);
  // The send action checks this again for every lead right before its email.
  const leads = allLeads
    .filter((lead) => !lead.unsubscribed_at)
    .map((lead) => ({ id: lead.id, name: lead.full_name, email: lead.email }));
  const coaches = recipients.map((recipient) => ({
    coachId: recipient.coachId,
    name: recipient.businessName,
    ownerName: recipient.ownerName,
    status: recipient.status,
  }));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <EmailsClient locale={locale} coaches={coaches} leads={leads} appUrl={appUrl} />
      <HistoryList locale={locale} campaigns={history} appUrl={appUrl} />
    </div>
  );
}
