import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import type { StructuredAdjustment } from "@/domain/progress/review.service";
import { OutcomeBadge, type OutcomeStatus } from "./outcome-badge";
import { AdjustmentSummary } from "./adjustment-summary";

export type PlanStoryEntry = {
  id: string;
  decision: "keep" | "adjust" | "call";
  reasonKey: string;
  clientNote: string | null;
  adjustments: StructuredAdjustment[];
  createdAt: string;
  appliedAt: string | null;
  outcomeStatus: OutcomeStatus;
  evaluatedAt: string | null;
  /** Coach-side variant only (attribution across a team — team_members
   * share the owner's coach_id, so `decided_by` is what actually tells
   * two staff members' decisions apart). Omitted client-side: which
   * specific staff member decided isn't the client's business. */
  decidedByName?: string | null;
};

/** The Coaching Ledger's timeline, shared between the client's "My Plan
 * Story" (progress page) and the coach's Decisions tab on a client
 * profile — same Signal -> Decision -> Change -> Outcome record, just
 * rendered for two different readers. Read-only: applying a change happens
 * from the review console / Program Builder banner, not from here. */
export async function PlanStory({
  locale,
  entries,
  emptyTitle,
  emptyDescription,
}: {
  locale: AppLocale;
  entries: PlanStoryEntry[];
  emptyTitle: string;
  emptyDescription?: string;
}) {
  const t = await getTranslations("ledger");
  const tReason = await getTranslations("review.reason.options");

  if (entries.length === 0) {
    return <EmptyState brandMark title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => (
        <Card key={entry.id}>
          <CardContent className="flex flex-col gap-2 pt-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{t(`decisionLabel.${entry.decision}`)}</span>
              <span className="text-xs text-muted-foreground">· {tReason(entry.reasonKey)}</span>
              {entry.decidedByName && (
                <span className="text-xs text-muted-foreground">· {t("byName", { name: entry.decidedByName })}</span>
              )}
              <span className="ms-auto font-mono text-[10px] text-muted-foreground tabular-nums">
                {formatDate(entry.createdAt, locale, { dateStyle: "medium" })}
              </span>
            </div>

            {entry.clientNote && <p className="text-sm leading-relaxed">«{entry.clientNote}»</p>}

            {entry.adjustments.length > 0 ? (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{t("changesLabel")}</p>
                <AdjustmentSummary adjustments={entry.adjustments} />
              </div>
            ) : (
              entry.decision === "adjust" && <p className="text-xs text-muted-foreground">{t("noChanges")}</p>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <OutcomeBadge status={entry.outcomeStatus} />
              {entry.appliedAt && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {t("appliedOn", { date: formatDate(entry.appliedAt, locale, { dateStyle: "medium" }) })}
                </span>
              )}
              {entry.evaluatedAt && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {t("checkedOn", { date: formatDate(entry.evaluatedAt, locale, { dateStyle: "medium" }) })}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
