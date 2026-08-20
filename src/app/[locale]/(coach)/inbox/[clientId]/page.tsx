import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MessageThread } from "@/components/messages/message-thread";
import { PageTitle } from "@/components/dashboard/page-title";
import type { AppLocale } from "@/domain/locale";

export default async function InboxThreadPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; clientId: string }>;
}) {
  const { locale, clientId } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id, display_name, coach_id")
    .eq("id", clientId)
    .maybeSingle();

  if (!client) notFound();

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col gap-4 md:h-[calc(100dvh-6rem)]">
      <PageTitle title={client.display_name} />
      <MessageThread clientId={client.id} viewerRole="coach" locale={locale} />
    </div>
  );
}
