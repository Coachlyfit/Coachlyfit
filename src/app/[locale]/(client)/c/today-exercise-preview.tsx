"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { ProgramTree } from "@/domain/programs/programs.service";
import { useTranslations } from "next-intl";
import { ExerciseVideoSheet, type VideoSheetExercise } from "@/components/workout/exercise-video-sheet";
import { measurementFields } from "@/domain/library/measurement";
import { formatSetMeasures, measuresFromRow } from "@/domain/workouts/set-measures";

type PreviewItem = ProgramTree["program_days"][number]["program_items"][number];

/** Today's exercise preview list — tappable when an exercise has a video,
 * opening the same form-check sheet the workout runner uses. Sets×reps stay
 * visible either way; the play icon only shows up when there's actually
 * something to watch. */
export function TodayExercisePreview({ locale, items }: { locale: AppLocale; items: PreviewItem[] }) {
  const [selected, setSelected] = useState<VideoSheetExercise | null>(null);
  const tm = useTranslations("measure");

  // Reps-based exercises keep the "sets × rep range" line; a hold, a run or a
  // carry reads from its first set ("30 s", "5 km · 28 min").
  const target = (item: PreviewItem) =>
    measurementFields(item.exercises.measurement_type, item.block).includes("reps")
      ? `${item.sets} × ${item.reps}`
      : `${item.sets} × ${formatSetMeasures(item.exercises.measurement_type, item.block, measuresFromRow(item.program_item_sets[0]), tm)}`;

  return (
    <>
      <div className="flex flex-col gap-2 px-4.5 pb-3.5">
        {items.map((item) => {
          const hasVideo = !!item.exercises.video_url;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => hasVideo && setSelected(item.exercises)}
              disabled={!hasVideo}
              className="flex min-h-10 items-center gap-2.5 text-start disabled:cursor-default"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              <span className="flex-1 truncate text-[13px]">{pickLocale(item.exercises, locale)}</span>
              {hasVideo && <Play className="size-2.5 shrink-0 fill-primary text-primary" aria-hidden="true" />}
              <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                {target(item)}
              </span>
            </button>
          );
        })}
      </div>
      <ExerciseVideoSheet
        locale={locale}
        exercise={selected}
        open={selected != null}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </>
  );
}
