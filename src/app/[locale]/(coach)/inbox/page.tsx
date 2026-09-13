import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { MessageCircle } from "lucide-react";
import { PageTitle } from "@/components/dashboard/page-title";
import { BroadcastDialog } from "./broadcast-dialog";
import { NewMessageDialog } from "./new-message-dialog";
import { InboxList } from "./inbox-list";
import { MessagesService } from "@/domain/messages/messages.service";
import type { AppLocale } from "@/domain/locale";

export default async function InboxPage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  const t = await getTranslations("inbox");
  const supabase = await createClient();

  const threads = await new MessagesService(supabase).listInbox();
  const clients = threads.map((thread) => ({ id: thread.client_id, display_name: thread.display_name }));

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("title")} />
      {threads.length === 0 ? (
        <EmptyState icon={MessageCircle} title={t("clientList.empty")} />
      ) : (
        <>
          <div className="flex items-center justify-end gap-2">
            <NewMessageDialog clients={clients} />
            <BroadcastDialog />
          </div>
          <InboxList threads={threads} locale={locale} />
        </>
      )}
    </div>
  );
}
