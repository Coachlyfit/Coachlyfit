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
import { cn } from "@/lib/utils";
import { useEquipmentLabel } from "./equipment-filter";
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
  const equipmentLabel = useEquipmentLabel();
  const name = pickLocale(exercise, locale);
  const groupLabel = isKnownMuscleGroup(exercise.muscle_group)
    ? tGroups(exercise.muscle_group)
    : exercise.muscle_group;
  const equipment = equipmentLabel(exercise.equipment);

  if (variant === "compact") {
    const meta = [groupLabel, equipment].filter(Boolean).join(" · ");
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

  return (
    <Card className="gap-0 py-0">
      <div className="relative">
        <ExerciseMedia media={media} name={name} className="aspect-[4/3]" />
        {exercise.coach_id && (
          <Badge variant="warning" className="absolute end-2.5 top-2.5">
            {t("mineBadge.exercises")}
          </Badge>
        )}
      </div>
      <CardContent className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 font-semibold">{name}</h3>
        <div className="flex flex-wrap gap-1.5">
          {groupLabel && (
            <Badge variant="secondary" className="rounded-md">
              {groupLabel}
            </Badge>
          )}
          {equipment && (
            <Badge variant="outline" className="rounded-md">
              {equipment}
            </Badge>
          )}
        </div>
        <div className="mt-auto flex justify-end gap-1">
          {!exercise.coach_id ? (
            exercise.my_clone_id ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${t("editMyVersion")}: ${name}`}
                title={t("editMyVersion")}
                onClick={onEditMyClone}
              >
                <Pencil className="size-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${t("preview.duplicateAndEdit")}: ${name}`}
                title={t("preview.duplicateAndEdit")}
                onClick={onClone}
              >
                <Copy className="size-4" />
              </Button>
            )
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${t("edit")}: ${name}`}
                title={t("edit")}
                onClick={onEdit}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive hover:text-destructive"
                aria-label={`${t("delete")}: ${name}`}
                title={t("delete")}
                onClick={onDelete}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Fixed-aspect box (16:9 unless `className` says otherwise) regardless of media state — image, embed, link, or
 * none — so a missing/broken GIF can't collapse the card or shift the grid
 * as results stream in. The iframe only mounts after a click: 24 eager
 * embeds on one page is real bandwidth, not just a media nicety. */
export function ExerciseMedia({
  media,
  name,
  className = "aspect-video",
}: {
  media: ReturnType<typeof resolveExerciseMedia>;
  name: string;
  className?: string;
}) {
  const t = useTranslations("library.media");
  const [playing, setPlaying] = useState(false);

  if (media?.kind === "image") {
    return (
      <div className={cn(className, "w-full overflow-hidden bg-muted")}>
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
        <div className={cn(className, "w-full overflow-hidden bg-black")}>
          <iframe src={media.src} className="h-full w-full" allowFullScreen title={name} />
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        className={cn(className, "group/play relative w-full overflow-hidden bg-muted")}
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
    <div className={cn(className, "flex w-full items-center justify-center bg-muted")}>
      <Dumbbell className="size-8 text-muted-foreground/40" aria-hidden="true" />
    </div>
  );
}
