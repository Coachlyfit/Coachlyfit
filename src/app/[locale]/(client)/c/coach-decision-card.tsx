"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { StructuredAdjustment } from "@/domain/progress/review.service";
import { AdjustmentSummary } from "@/components/ledger/adjustment-summary";
import { markDecisionSeenAction } from "./decision-actions";

export type ClientDecisionCardData = {
  id: string;
  decision: "keep" | "adjust" | "call";
  reasonKey: string;
  clientNote: string | null;
  adjustments: StructuredAdjustment[];
};

/** The client home's window into the Coaching Ledger — the first place a
 * client sees the coach's review decision and its reason at all: today
 * that reply only reaches them as a chat message with no link to what
 * actually changed (see review/actions.ts's submitReviewAction). Marks
 * itself seen on mount (client_seen_at), same idempotent-on-first-call
 * shape as mark_checkin_seen. Dismissing only hides the card for this
 * visit — it isn't a delete, and the same decision still shows up in "My
 * Plan Story" (progress page) and stays gone from here on the next visit
 * once `latestUnseenForClient`'s 7-day recency window passes. */
export function CoachDecisionCard({ decision }: { decision: ClientDecisionCardData | null }) {
  const t = useTranslations("client.decisionCard");
  const tReason = useTranslations("review.reason.options");
  const tDecision = useTranslations("ledger.decisionLabel");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (decision) markDecisionSeenAction(decision.id);
  }, [decision]);

  if (!decision || dismissed) return null;

  return (
    <Card className="border-accent-tint bg-accent-tint">
      <CardContent className="flex flex-col gap-2 pt-6">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-accent-tint-foreground/70">{t("title")}</p>
            <p className="mt-1 text-sm font-semibold text-accent-tint-foreground">{tDecision(decision.decision)}</p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label={t("dismiss")}
            className="shrink-0 text-accent-tint-foreground/60 hover:text-accent-tint-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <p className="text-xs text-accent-tint-foreground/80">
          {t("reasonPrefix")} {tReason(decision.reasonKey)}
        </p>

        {decision.clientNote && <p className="text-sm text-accent-tint-foreground">«{decision.clientNote}»</p>}

        {decision.adjustments.length > 0 && (
          <div className="text-accent-tint-foreground">
            <p className="text-xs font-medium">{t("changesPrefix")}</p>
            <AdjustmentSummary adjustments={decision.adjustments} />
          </div>
        )}

        <Link
          href="/c/progress"
          className="mt-1 text-xs font-medium text-accent-tint-foreground underline underline-offset-2"
        >
          {t("seeStory")}
        </Link>
      </CardContent>
    </Card>
  );
}
