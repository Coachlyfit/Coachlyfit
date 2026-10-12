"use client";

import { useTranslations } from "next-intl";
import { Dumbbell, Film } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { isKnownMuscleGroup } from "@/domain/library/taxonomy";
import { resolveExerciseMedia } from "@/lib/video-embed";
import { cn } from "@/lib/utils";
import { useEquipmentLabel } from "./equipment-filter";
import type { searchExercisesAction, searchFoodsAction } from "./actions";

type Exercise = Awaited<ReturnType<typeof searchExercisesAction>>["rows"][number];
type Food = Awaited<ReturnType<typeof searchFoodsAction>>["rows"][number];

const ROW = "cursor-pointer";
const SELECTED_ROW = "bg-primary/5 hover:bg-primary/5";
// The row's click target for keyboard and screen-reader users: a real button
// inside the first cell, whose click bubbles to the row's own handler.
const NAME_BUTTON =
  "min-w-0 truncate rounded-sm text-start font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
const NUMERIC = "text-end font-mono tabular-nums";

/** 48px box whatever the media is, so a slow or missing GIF can't shift the
 * row. Only images render here — an embed is a film icon until the preview
 * panel plays it. */
function Thumb({ url }: { url: string | null }) {
  const media = resolveExerciseMedia(url);
  return (
    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground/50">
      {media?.kind === "image" ? (
        <img src={media.src} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : media?.kind === "embed" ? (
        <Film className="size-5" aria-hidden="true" />
      ) : (
        <Dumbbell className="size-5" aria-hidden="true" />
      )}
    </span>
  );
}

export function ExerciseTable({
  exercises,
  locale,
  selectedId,
  onSelect,
  coachBadge,
}: {
  exercises: Exercise[];
  locale: AppLocale;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Admin view: label for coach-owned rows instead of the coach's "Mine". */
  coachBadge?: string;
}) {
  const t = useTranslations("library");
  const tGroups = useTranslations("library.muscleGroups");
  const equipmentLabel = useEquipmentLabel();

  return (
    <Table className="min-w-[520px]">
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className="px-4 text-muted-foreground">{t("columns.exercise")}</TableHead>
          <TableHead className="px-4 text-muted-foreground">{t("columns.group")}</TableHead>
          <TableHead className="px-4 text-muted-foreground">{t("columns.equipment")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {exercises.map((ex) => {
          const selected = ex.id === selectedId;
          const groupLabel = isKnownMuscleGroup(ex.muscle_group) ? tGroups(ex.muscle_group) : ex.muscle_group;
          return (
            <TableRow
              key={ex.id}
              onClick={() => onSelect(ex.id)}
              className={cn(ROW, selected && SELECTED_ROW)}
            >
              <TableCell className="px-4 py-2">
                <div className="flex items-center gap-3">
                  <Thumb url={ex.thumbnail_url || ex.image_url || ex.video_url} />
                  <button type="button" aria-pressed={selected} className={cn(NAME_BUTTON, "max-w-64")}>
                    {pickLocale(ex, locale)}
                  </button>
                  {ex.coach_id && <Badge variant="warning">{coachBadge ?? t("mineBadge.exercises")}</Badge>}
                </div>
              </TableCell>
              <TableCell className="px-4 py-2">
                {groupLabel ? (
                  <Badge variant="secondary" className="rounded-md">
                    {groupLabel}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="px-4 py-2">
                {equipmentLabel(ex.equipment) ?? <span className="text-muted-foreground">—</span>}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function FoodTable({
  foods,
  locale,
  selectedId,
  onSelect,
  coachBadge,
}: {
  foods: Food[];
  locale: AppLocale;
  selectedId: string | null;
  onSelect: (id: string) => void;
  coachBadge?: string;
}) {
  const t = useTranslations("library");
  const tCategories = useTranslations("library.foodCategories");

  return (
    <Table className="min-w-[640px]">
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className="px-4 text-muted-foreground">{t("columns.food")}</TableHead>
          <TableHead className="px-4 text-muted-foreground">{t("columns.serving")}</TableHead>
          <TableHead className="px-4 text-end text-muted-foreground">{t("columns.kcal")}</TableHead>
          <TableHead className="px-4 text-end text-muted-foreground">{t("columns.protein")}</TableHead>
          <TableHead className="px-4 text-end text-muted-foreground">{t("columns.carbs")}</TableHead>
          <TableHead className="px-4 text-end text-muted-foreground">{t("columns.fat")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {foods.map((food) => {
          const selected = food.id === selectedId;
          return (
            <TableRow
              key={food.id}
              onClick={() => onSelect(food.id)}
              className={cn(ROW, selected && SELECTED_ROW)}
            >
              <TableCell className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-col">
                    <button type="button" aria-pressed={selected} className={cn(NAME_BUTTON, "max-w-56")}>
                      {pickLocale(food, locale)}
                    </button>
                    <span className="text-muted-foreground">{tCategories(food.category)}</span>
                  </div>
                  {food.coach_id && <Badge variant="warning">{coachBadge ?? t("mineBadge.foods")}</Badge>}
                </div>
              </TableCell>
              <TableCell className="px-4 py-3 font-mono tabular-nums">
                <bdi>{food.serving_label}</bdi>
              </TableCell>
              <TableCell className={cn("px-4 py-3 font-semibold", NUMERIC)}>{food.kcal}</TableCell>
              <TableCell className={cn("px-4 py-3", NUMERIC)}>{food.protein_g}g</TableCell>
              <TableCell className={cn("px-4 py-3", NUMERIC)}>{food.carb_g}g</TableCell>
              <TableCell className={cn("px-4 py-3", NUMERIC)}>{food.fat_g}g</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
