import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { LedgerService } from "@/domain/ledger/ledger.service";
import { toPlanStoryEntry } from "@/domain/ledger/view";
import { PlanStory } from "@/components/ledger/plan-story";
import type { AppLocale } from "@/domain/locale";

/** Coach-side view of the same Coaching Ledger the client sees as "My Plan
 * Story" — the review console (checkin decisions) and the Program Builder
 * banner (applying them) are where a decision is MADE; this tab is where
 * the coach can look back at the whole trail for this one client,
 * including which staff member decided (team_members share the owner's
 * coach_id, so `decided_by` is the only thing that tells two coaches'
 * decisions apart here). */
export async function DecisionsSection({ clientId, locale }: { clientId: string; locale: AppLocale }) {
  const t = await getTranslations("clients.decisions");
  const supabase = await createClient();
  const decisions = await new LedgerService(supabase).listForClientWithDeciderName(clientId);
  const entries = decisions.map((d) => toPlanStoryEntry(d, d.profiles?.full_name ?? null));

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
      <PlanStory locale={locale} entries={entries} emptyTitle={t("empty")} />
    </div>
  );
}
