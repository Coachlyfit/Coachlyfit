"use client";

import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { toEmbedUrl } from "@/lib/video-embed";
import { MUSCLE_GROUPS, type MuscleGroup } from "@/domain/library/taxonomy";
import type { searchExercisesAction } from "./actions";

type Exercise = Awaited<ReturnType<typeof searchExercisesAction>>[number];

function isKnownMuscleGroup(value: string | null): value is MuscleGroup {
  return !!value && (MUSCLE_GROUPS as readonly string[]).includes(value);
}

export function ExerciseCard({
  exercise,
  locale,
  onDelete,
}: {
  exercise: Exercise;
  locale: AppLocale;
  onDelete: () => void;
}) {
  const t = useTranslations("library");
  const tGroups = useTranslations("library.muscleGroups");
  const embedUrl = exercise.video_url ? toEmbedUrl(exercise.video_url) : null;
  const groupLabel = isKnownMuscleGroup(exercise.muscle_group)
    ? tGroups(exercise.muscle_group)
    : exercise.muscle_group;

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium">{pickLocale(exercise, locale)}</p>
          <Badge variant={exercise.coach_id ? "secondary" : "outline"}>
            {exercise.coach_id ? t("mine") : t("official")}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {[groupLabel, exercise.equipment].filter(Boolean).join(" · ")}
        </p>
        {embedUrl ? (
          <div className="aspect-video overflow-hidden rounded-md bg-black">
            <iframe
              src={embedUrl}
              className="h-full w-full"
              allowFullScreen
              title={pickLocale(exercise, locale)}
            />
          </div>
        ) : (
          exercise.video_url && (
            <a
              href={exercise.video_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary underline underline-offset-4"
            >
              {t("watchVideo")}
            </a>
          )
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
