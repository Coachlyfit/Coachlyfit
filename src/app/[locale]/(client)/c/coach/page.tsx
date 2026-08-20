import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { MessageThread } from "@/components/messages/message-thread";
import type { AppLocale } from "@/domain/locale";

export default async function ClientCoachPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("nav");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: clientRow } = await supabase
    .from("clients")
    .select("id, coaches(business_name)")
    .eq("profile_id", user!.id)
    .single();

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        {clientRow?.coaches?.business_name ?? t("coach")}
      </h1>
      {clientRow && <MessageThread clientId={clientRow.id} viewerRole="client" locale={locale} />}
    </div>
  );
}
