import { useTranslations } from "next-intl";
import type { StructuredAdjustment } from "@/domain/progress/review.service";

/** Renders a decision's `adjustments` (StructuredAdjustment[]) as short
 * human lines — reuses the exact same copy the Program Builder's pending-
 * adjustments banner already shows (programs.pendingAdjustments.*), so a
 * change reads identically whether the coach sees it on that banner or a
 * client/coach sees it later on the Coaching Ledger. No exercise names
 * (same as that banner): the adjustment picks a whole program or a set of
 * items, and naming a "reduce load" or "removed" exercise here would need
 * a join this list of small ledger surfaces doesn't otherwise need. */
export function AdjustmentSummary({ adjustments }: { adjustments: StructuredAdjustment[] }) {
  const t = useTranslations("programs.pendingAdjustments");
  if (adjustments.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1">
      {adjustments.map((adjustment, i) => (
        <li key={i} className="text-sm">
          {adjustment.key === "reduceLoad" &&
            (adjustment.itemIds.length === 0
              ? t("reduceLoadWholeProgram", { percent: adjustment.percent })
              : t("reduceLoad", { percent: adjustment.percent }))}
          {adjustment.key === "removeMovement" && t("removeMovement", { count: adjustment.itemIds.length })}
          {adjustment.key === "extraWarmup" && t("extraWarmup")}
          {adjustment.key === "extraRestDay" && t("extraRestDay")}
        </li>
      ))}
    </ul>
  );
}
