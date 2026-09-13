"use client";

import { useTranslations } from "next-intl";
import { ArrowUpCircle, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { isKnownMuscleGroup } from "@/domain/library/taxonomy";
import type { adminSearchExercisesAction } from "./actions";

type Exercise = Awaited<ReturnType<typeof adminSearchExercisesAction>>["rows"][number];

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

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 font-medium">{name}</p>
          <Badge variant={exercise.coach_id ? "secondary" : "outline"}>
            {exercise.coach_id ? tAdmin("coachOwner") : tAdmin("globalOwner")}
          </Badge>
        </div>
        {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
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
