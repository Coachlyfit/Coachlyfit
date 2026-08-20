import { createClient } from "@/lib/supabase/server";
import { ProgressService } from "@/domain/progress/progress.service";
import type { AppLocale } from "@/domain/locale";
import { CheckinStackClient } from "./checkin-stack-client";

export default async function ClientCheckinPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: clientRow } = await supabase
    .from("clients")
    .select("id, coaches(business_name)")
    .eq("profile_id", user!.id)
    .single();

  const todayIso = new Date().toISOString().slice(0, 10);
  const existing = clientRow ? await new ProgressService(supabase).getCheckin(clientRow.id, todayIso) : null;

  return (
    <CheckinStackClient
      locale={locale}
      today={todayIso}
      existing={existing}
      businessName={clientRow?.coaches?.business_name ?? ""}
    />
  );
}
