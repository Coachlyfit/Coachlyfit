"use client";

import { useTranslations } from "next-intl";
import { ArrowUpCircle, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { resolveExerciseMedia } from "@/lib/video-embed";
import { isKnownMuscleGroup } from "@/domain/library/taxonomy";
import { exerciseToBodyState } from "@/domain/library/muscle-regions";
import { BodyMap } from "@/components/body-map/body-map";
import { ExerciseMedia } from "@/app/[locale]/(coach)/library/exercise-card";
import type { adminSearchExercisesAction } from "./actions";

type Exercise = Awaited<ReturnType<typeof adminSearchExercisesAction>>["rows"][number];

/** Mirrors the coach ExerciseCard (media, difficulty, body map) — only the
 * actions differ: a coach-owned row is promote-only, a global is edit/delete. */
export function AdminExerciseCard({
  exercise,
  locale,
  onEdit,
  onDelete,
  onPromote,
  variant = "default",
}: {
  exercise: Exercise;
  locale: AppLocale;
  onEdit: () => void;
  onDelete: () => void;
  onPromote: () => void;
  variant?: "default" | "compact";
}) {
  const t = useTranslations("library");
  const tAdmin = useTranslations("admin.library");
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
            <Badge variant={exercise.coach_id ? "secondary" : "outline"}>
              {exercise.coach_id ? tAdmin("coachOwner") : tAdmin("globalOwner")}
            </Badge>
          </div>
        </div>
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
          {exercise.coach_id ? (
            <Button variant="ghost" size="sm" onClick={onPromote}>
              <ArrowUpCircle className="size-4" />
              {tAdmin("promote")}
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onEdit}>
                <Pencil className="size-4" />
                {tAdmin("edit")}
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
