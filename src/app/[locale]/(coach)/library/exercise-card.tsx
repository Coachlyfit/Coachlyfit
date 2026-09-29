"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Dumbbell, Film, Pencil, Play, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { resolveExerciseMedia } from "@/lib/video-embed";
import { isKnownMuscleGroup } from "@/domain/library/taxonomy";
import { exerciseToBodyState } from "@/domain/library/muscle-regions";
import { BodyMap } from "@/components/body-map/body-map";
import type { searchExercisesAction } from "./actions";

type Exercise = Awaited<ReturnType<typeof searchExercisesAction>>["rows"][number];

export function ExerciseCard({
  exercise,
  locale,
  onDelete,
  onClone,
  onEdit,
  onEditMyClone,
  variant = "default",
}: {
  exercise: Exercise;
  locale: AppLocale;
  onDelete: () => void;
  /** Global card, not yet cloned. */
  onClone: () => void;
  /** The coach's own row (a clone or a plain private addition). */
  onEdit: () => void;
  /** Global card the coach already cloned — my_clone_id names the row but
   * not its (possibly renamed) fields, so the parent re-fetches it before
   * opening the edit dialog. */
  onEditMyClone: () => void;
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
  // A clone that's been promoted to global (coach_id -> null) keeps its
  // source_exercise_id, but there's no coach left to have "customized" it
  // from the viewer's perspective — so the badge/attribution only shows
  // while the row is still coach-owned.
  const isCustomized = !!exercise.coach_id && !!exercise.source_exercise_id;
  const badgeLabel = !exercise.coach_id ? t("official") : isCustomized ? t("customized") : t("mine");

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

  const media = resolveExerciseMedia(exercise.thumbnail_url || exercise.image_url || exercise.video_url);
  const bodyState = exerciseToBodyState(exercise.primary_muscles, exercise.secondary_muscles, exercise.muscle_group);

  return (
    <Card className="pt-0">
      <ExerciseMedia media={media} name={name} />
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 font-medium">{name}</p>
          <div className="flex shrink-0 gap-1">
            {exercise.difficulty && (
              <Badge variant="outline">{t(`exercise.difficultyLevel.${exercise.difficulty}`)}</Badge>
            )}
            <Badge variant={exercise.coach_id ? "secondary" : "outline"}>{badgeLabel}</Badge>
          </div>
        </div>
        {isCustomized && (
          <p className="text-xs text-muted-foreground">
            {t("basedOn", { name: pickLocale(exercise, locale, "source_name") })}
          </p>
        )}
        {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
        {Object.keys(bodyState).length > 0 && (
          <BodyMap state={bodyState} ariaLabel={t("musclesWorked")} className="mx-auto max-w-[180px]" />
        )}
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
        <div className="flex justify-end gap-1">
          {!exercise.coach_id ? (
            exercise.my_clone_id ? (
              <Button variant="ghost" size="sm" onClick={onEditMyClone}>
                <Pencil className="size-4" />
                {t("editMyVersion")}
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={onClone}>
                <Copy className="size-4" />
                {t("clone")}
              </Button>
            )
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onEdit}>
                <Pencil className="size-4" />
                {t("edit")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="size-4" />
                {t("delete")}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Fixed aspect-video box regardless of media state — image, embed, link, or
 * none — so a missing/broken GIF can't collapse the card or shift the grid
 * as results stream in. The iframe only mounts after a click: 24 eager
 * embeds on one page is real bandwidth, not just a media nicety. */
export function ExerciseMedia({ media, name }: { media: ReturnType<typeof resolveExerciseMedia>; name: string }) {
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
