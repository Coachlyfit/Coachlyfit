"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/domain/locale";
import type { StructuredAdjustment } from "@/domain/progress/review.service";
import { applyAdjustmentAction } from "../actions";

export type PendingAdjustmentCheckin = {
  checkinId: string;
  adjustments: StructuredAdjustment[];
};

const ACTIONABLE_KEYS: StructuredAdjustment["key"][] = ["reduceLoad", "removeMovement"];

function AdjustmentRow({
  locale,
  programId,
  checkinId,
  adjustment,
}: {
  locale: AppLocale;
  programId: string;
  checkinId: string;
  adjustment: StructuredAdjustment;
}) {
  const t = useTranslations("programs.pendingAdjustments");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [applied, setApplied] = useState(false);

  const label =
    adjustment.key === "reduceLoad"
      ? adjustment.itemIds.length === 0
        ? t("reduceLoadWholeProgram", { percent: adjustment.percent })
        : t("reduceLoad", { percent: adjustment.percent })
      : adjustment.key === "removeMovement"
        ? t("removeMovement", { count: adjustment.itemIds.length })
        : t(adjustment.key);

  const actionable = ACTIONABLE_KEYS.includes(adjustment.key);

  function onApply() {
    startTransition(async () => {
      await applyAdjustmentAction(locale, programId, checkinId, adjustment);
      setApplied(true);
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm text-warning-tint-foreground">
      <span>{label}</span>
      {actionable &&
        (applied ? (
          <span className="shrink-0 text-xs text-muted-foreground">{t("applied")}</span>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onApply} className="shrink-0 min-w-24">
            {pending ? tCommon("pending") : t("apply")}
          </Button>
        ))}
    </div>
  );
}

/** Surfaces a client's un-applied "adjust" review decisions above the
 * builder so the coach can turn one into a real program_items/
 * program_item_sets mutation without leaving this page — see
 * review.service.ts's StructuredAdjustment for the shape and
 * ProgramsService.applyLoadReduction/removeItem for what "Apply" actually
 * does. extraWarmup/extraRestDay have no program-side mutation, so they
 * render as context only, no Apply button. */
export function PendingAdjustmentsBanner({
  locale,
  programId,
  pending,
}: {
  locale: AppLocale;
  programId: string;
  pending: PendingAdjustmentCheckin[];
}) {
  const t = useTranslations("programs.pendingAdjustments");
  if (pending.length === 0) return null;

  return (
    <Card className="border-warning-tint-foreground/30 bg-warning-tint">
      <CardContent className="flex flex-col gap-1 pt-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-warning-tint-foreground">{t("title")}</p>
        <div className="flex flex-col divide-y divide-warning-tint-foreground/15">
          {pending.map((checkin) =>
            checkin.adjustments.map((adjustment, i) => (
              <AdjustmentRow
                key={`${checkin.checkinId}-${i}`}
                locale={locale}
                programId={programId}
                checkinId={checkin.checkinId}
                adjustment={adjustment}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
