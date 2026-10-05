"use client";

import { useTranslations } from "next-intl";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { isKnownMuscleGroup } from "@/domain/library/taxonomy";
import { macroPercentages } from "@/domain/nutrition/macros";
import { resolveExerciseMedia } from "@/lib/video-embed";
import { cn } from "@/lib/utils";
import { ExerciseMedia } from "./exercise-card";
import { FOOD_MACROS } from "./food-card";
import { useEquipmentLabel } from "./equipment-filter";
import type { searchExercisesAction, searchFoodsAction } from "./actions";

type Exercise = Awaited<ReturnType<typeof searchExercisesAction>>["rows"][number];
type Food = Awaited<ReturnType<typeof searchFoodsAction>>["rows"][number];

type Actions = {
  /** Official row, not yet cloned. */
  onClone: () => void;
  /** Official row the coach already cloned. */
  onEditMyClone: () => void;
  /** The coach's own row. */
  onEdit: () => void;
  onDelete: () => void;
};

/** The list view has no per-row buttons, so everything a row can do lives
 * here: an official item is duplicated (or, once duplicated, its copy is
 * edited); the coach's own item is edited or deleted. */
function PanelActions({
  owned,
  cloned,
  onClone,
  onEditMyClone,
  onEdit,
  onDelete,
}: Actions & { owned: boolean; cloned: boolean }) {
  const t = useTranslations("library");

  if (owned) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="flex-1" onClick={onEdit}>
          <Pencil className="size-4" />
          {t("edit")}
        </Button>
        <Button variant="outline" className="text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="size-4" />
          {t("delete")}
        </Button>
      </div>
    );
  }
  return cloned ? (
    <Button variant="secondary" onClick={onEditMyClone}>
      <Pencil className="size-4" />
      {t("editMyVersion")}
    </Button>
  ) : (
    <Button variant="secondary" onClick={onClone}>
      <Copy className="size-4" />
      {t("preview.duplicateAndEdit")}
    </Button>
  );
}

const PANEL = "overflow-hidden rounded-xl border bg-card";

export function ExercisePreview({
  exercise,
  locale,
  className,
  ...actions
}: Actions & { exercise: Exercise; locale: AppLocale; className?: string }) {
  const t = useTranslations("library");
  const tGroups = useTranslations("library.muscleGroups");
  const tSource = useTranslations("library.source");
  const equipmentLabel = useEquipmentLabel();
  const name = pickLocale(exercise, locale);
  const media = resolveExerciseMedia(exercise.thumbnail_url || exercise.image_url || exercise.video_url);
  const groupLabel = isKnownMuscleGroup(exercise.muscle_group)
    ? tGroups(exercise.muscle_group)
    : exercise.muscle_group;
  const basedOn = exercise.coach_id && exercise.source_exercise_id ? pickLocale(exercise, locale, "source_name") : null;

  return (
    <aside aria-label={t("preview.label")} className={cn(PANEL, className)}>
      <ExerciseMedia media={media} name={name} className="aspect-[4/3]" />
      <div className="flex flex-col gap-3.5 p-5">
        <h2 className="text-xl font-semibold">{name}</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t("columns.group")}</dt>
          <dd className="font-medium">{groupLabel || "—"}</dd>
          <dt className="text-muted-foreground">{t("columns.equipment")}</dt>
          <dd className="font-medium">{equipmentLabel(exercise.equipment) ?? "—"}</dd>
          <dt className="text-muted-foreground">{t("columns.source")}</dt>
          <dd className="font-medium">
            {exercise.coach_id ? t("mineBadge.exercises") : tSource("global")}
            {basedOn && <span className="block font-normal text-muted-foreground">{t("basedOn", { name: basedOn })}</span>}
          </dd>
        </dl>
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
        <PanelActions owned={!!exercise.coach_id} cloned={!!exercise.my_clone_id} {...actions} />
      </div>
    </aside>
  );
}

export function FoodPreview({
  food,
  locale,
  className,
  ...actions
}: Actions & { food: Food; locale: AppLocale; className?: string }) {
  const t = useTranslations("library");
  const tColumns = useTranslations("library.columns");
  const tCategories = useTranslations("library.foodCategories");
  const shares = macroPercentages(food);
  const basedOn = food.coach_id && food.source_food_id ? pickLocale(food, locale, "source_name") : null;

  return (
    <aside aria-label={t("preview.label")} className={cn(PANEL, "flex flex-col gap-4 p-5", className)}>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="rounded-md">
            {tCategories(food.category)}
          </Badge>
          {food.coach_id && <Badge variant="warning">{t("mineBadge.foods")}</Badge>}
        </div>
        <h2 className="text-xl font-semibold">{pickLocale(food, locale)}</h2>
        <span className="text-sm text-muted-foreground">
          {t.rich("preview.perServing", {
            serving: food.serving_label,
            mono: (chunks) => <bdi className="font-mono tabular-nums">{chunks}</bdi>,
          })}
        </span>
        {basedOn && <span className="text-sm text-muted-foreground">{t("basedOn", { name: basedOn })}</span>}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-3xl font-semibold tabular-nums">{food.kcal}</span>
        <span className="text-sm text-muted-foreground">{t("preview.kcalUnit")}</span>
      </div>
      <div role="img" aria-label={t("preview.macroSplit")} className="flex h-3 overflow-hidden rounded-full bg-muted">
        {FOOD_MACROS.map(({ key, percent, color }) => (
          <div key={key} className={color} style={{ width: `${shares[percent]}%` }} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {FOOD_MACROS.map(({ key, field, color }) => (
          <div key={key} className="flex min-w-0 flex-col rounded-lg bg-muted/50 p-3">
            <span className="flex items-center gap-1.5 text-sm">
              <span className={cn("size-2 shrink-0 rounded-[2px]", color)} aria-hidden="true" />
              <span className="truncate">{tColumns(key)}</span>
            </span>
            <span className="font-mono text-lg font-semibold tabular-nums">{food[field]}g</span>
          </div>
        ))}
      </div>
      <PanelActions owned={!!food.coach_id} cloned={!!food.my_clone_id} {...actions} />
    </aside>
  );
}
