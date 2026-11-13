"use client";

import { useTranslations } from "next-intl";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { BlockScoreRow } from "@/domain/workouts/block-result";
import { formatDate } from "@/lib/format";
import { useBlockResultText } from "@/components/workout/timed-block";

/** Recent scores of timed workouts (AMRAP rounds + reps, For Time clocks,
 * EMOM / Tabata rounds), newest first. Renders nothing when there are none, so
 * athletes who never do a timed block do not see an empty section. */
export function BlockScores({ rows, locale }: { rows: BlockScoreRow[]; locale: AppLocale }) {
  const t = useTranslations("progress.scores");
  const tKinds = useTranslations("programs.builder.groupFormat.kinds");
  const text = useBlockResultText();
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
      <ul className="flex flex-col rounded-xl border border-border bg-card">
        {rows.map((row) => (
          <li key={`${row.sessionId}-${row.groupKey}`} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">
                {tKinds(row.result.kind)}
                {row.dayLabel && ` · ${pickLocale(row.dayLabel, locale)}`}
              </span>
              <span className="text-xs text-muted-foreground">{formatDate(row.startedAt, locale, { dateStyle: "medium" })}</span>
            </div>
            <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">{text(row.result)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
