import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/domain/locale";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Streak (check-in days), workouts completed, adherence. Adherence is the
 * average of the client's self-reported check-in adherence, so it's null —
 * and the tile hidden — until they've reported at least once. */
export async function StatTiles({
  locale,
  streak,
  workoutsDone,
  adherence,
}: {
  locale: AppLocale;
  streak: number;
  workoutsDone: number;
  adherence: number | null;
}) {
  const t = await getTranslations("client.overview");
  const tiles = [
    { key: "streak", value: formatNumber(streak, locale), label: t("statStreak") },
    { key: "workouts", value: formatNumber(workoutsDone, locale), label: t("statWorkouts") },
    ...(adherence != null ? [{ key: "adherence", value: `${formatNumber(adherence, locale)}%`, label: t("statAdherence") }] : []),
  ];

  return (
    <div className={cn("grid gap-2 lg:grid-cols-1", tiles.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {tiles.map((tile) => (
        <div
          key={tile.key}
          className="flex flex-col items-center gap-0.5 rounded-[14px] bg-card px-2.5 py-3 text-center ring-1 ring-foreground/10 lg:flex-row-reverse lg:justify-between lg:px-4 lg:text-start"
        >
          <span dir="ltr" className="font-mono text-[22px] font-semibold tabular-nums">
            {tile.value}
          </span>
          <span className="text-xs text-muted-foreground lg:text-sm">{tile.label}</span>
        </div>
      ))}
    </div>
  );
}
