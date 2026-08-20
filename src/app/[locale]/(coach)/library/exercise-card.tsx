"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dumbbell, Film, Play, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { resolveExerciseMedia } from "@/lib/video-embed";
import { isKnownMuscleGroup } from "@/domain/library/taxonomy";
import type { searchExercisesAction } from "./actions";

type Exercise = Awaited<ReturnType<typeof searchExercisesAction>>["rows"][number];

export function ExerciseCard({
  exercise,
  locale,
  onDelete,
  variant = "default",
}: {
  exercise: Exercise;
  locale: AppLocale;
  onDelete: () => void;
  /** "compact" drops media and actions — used for kanban cards, where 60+
   * items per column would otherwise make the column as tall as the page. */
  variant?: "default" | "compact";
}) {
  const t = useTranslations("library");
  const tGroups = useTranslations("library.muscleGroups");
  const name = pickLocale(exercise, locale);
  const groupLabel = isKnownMuscleGroup(exercise.muscle_group)
    ? tGroups(exercise.muscle_group)
    : exercise.muscle_group;
  const meta = [groupLabel, exercise.equipment].filter(Boolean).join(" · ");

  if (variant === "compact") {
    return (
      <Card size="sm">
        <CardContent className="flex flex-col gap-0.5 p-2.5">
          <p className="line-clamp-2 text-sm font-medium">{name}</p>
          {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
        </CardContent>
      </Card>
    );
  }

  const media = resolveExerciseMedia(exercise.video_url);

  return (
    <Card className="pt-0">
      <ExerciseMedia media={media} name={name} />
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 font-medium">{name}</p>
          <Badge variant={exercise.coach_id ? "secondary" : "outline"} className="shrink-0">
            {exercise.coach_id ? t("mine") : t("official")}
          </Badge>
        </div>
        {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
        {media?.kind === "link" && (
          <a
            href={media.src}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary underline underline-offset-4"
          >
            {t("watchVideo")}
          </a>
        )}
        {exercise.coach_id && (
          <Button
            variant="ghost"
            size="sm"
            className="self-end text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
            {t("delete")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Fixed aspect-video box regardless of media state — image, embed, link, or
 * none — so a missing/broken GIF can't collapse the card or shift the grid
 * as results stream in. The iframe only mounts after a click: 24 eager
 * embeds on one page is real bandwidth, not just a media nicety. */
function ExerciseMedia({ media, name }: { media: ReturnType<typeof resolveExerciseMedia>; name: string }) {
  const t = useTranslations("library.media");
  const [playing, setPlaying] = useState(false);

  if (media?.kind === "image") {
    return (
      <div className="aspect-video w-full overflow-hidden bg-muted">
        <img
          src={media.src}
          alt={name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  if (media?.kind === "embed") {
    if (playing) {
      return (
        <div className="aspect-video w-full overflow-hidden bg-black">
          <iframe src={media.src} className="h-full w-full" allowFullScreen title={name} />
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        className="group/play relative aspect-video w-full overflow-hidden bg-muted"
        aria-label={t("play")}
      >
        <Film className="absolute inset-0 m-auto size-8 text-muted-foreground/50" aria-hidden="true" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover/play:bg-black/10">
          <span className="flex size-10 items-center justify-center rounded-full bg-background/90 shadow-sm">
            <Play className="size-4 fill-current" aria-hidden="true" />
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className="flex aspect-video w-full items-center justify-center bg-muted">
      <Dumbbell className="size-8 text-muted-foreground/40" aria-hidden="true" />
    </div>
  );
}
