import { createClient } from "@/lib/supabase/server";
import { PresenceService } from "@/domain/presence/presence.service";
import type { AppLocale } from "@/domain/locale";
import { OnlineView } from "./online-view";

/** One aggregate RPC (admin_online_summary(), admin-checked in the database)
 * for the cards and the coach list. The selected coach's clients and all
 * live updates happen in OnlineView. The layout's role redirect is the UX
 * guard; the RPC is the authorization boundary. */
export default async function AdminOnlinePage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  const supabase = await createClient();
  const summary = await new PresenceService(supabase).adminSummary();

  return <OnlineView locale={locale} initialSummary={summary} />;
}
