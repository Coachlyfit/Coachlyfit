"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { MUSCLE_GROUPS } from "@/domain/library/taxonomy";
import type { ProgramTree } from "@/domain/programs/programs.service";
import { searchExercisesAction } from "../../library/actions";
import { ItemDialog } from "./item-dialog";

type Day = ProgramTree["program_days"][number];
type PickedExercise = { id: string; name_ar: string; name_en: string };

/** Native HTML5 drag-and-drop, not dnd-kit — this gesture (sidebar list ->
 * a day card in a different component tree) doesn't need to share a
 * DndContext with the existing item/day pointer-based reorder gestures
 * (each already has its own, independent, dnd-kit context), and forcing a
 * third context to nest correctly around both the sidebar and every day
 * card is real complexity for a P1 the design itself calls smaller/more
 * mechanical than the progression work. Payload is the JSON a DayCard's
 * onDrop needs to open ItemDialog pre-filled, so no id-to-exercise lookup
 * is needed on the receiving end. */
export const EXERCISE_DRAG_MIME = "application/x-coachlyfit-exercise";

/** Inline click-to-add sidebar, replacing the old modal-first flow for
 * building out a day: search + muscle-group chips + a day picker, click an
 * exercise to open ItemDialog pre-filled via `initialExercise`. Drag-to-add
 * is deliberately not built here — a separate DndContext bridging this list
 * to each day's drop zone is real added surface for a P1 the design itself
 * calls smaller/more mechanical than the progression work; click-to-add
 * covers the same job. */
export function ExerciseSidebar({ locale, programId, days }: { locale: AppLocale; programId: string; days: Day[] }) {
  const t = useTranslations("programs.exerciseSidebar");
  const tGroups = useTranslations("library.muscleGroups");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [dayId, setDayId] = useState(days[0]?.id ?? "");
  const [picked, setPicked] = useState<PickedExercise | null>(null);
  const debounced = useDebouncedValue(query, 300);

  const { data, isPending } = useQuery({
    queryKey: ["programs", "exercise-sidebar", debounced, group],
    queryFn: () => searchExercisesAction({ query: debounced, source: "all", group: group ?? undefined, pageSize: 50 }),
  });
  const exercises = data?.rows;

  if (days.length === 0) return null;

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-border p-3">
      <h3 className="text-sm font-semibold">{t("title")}</h3>
      <select
        value={dayId}
        onChange={(e) => setDayId(e.target.value)}
        className="h-9 rounded-md border border-input bg-transparent px-2 text-base md:text-sm"
      >
        {days.map((day) => (
          <option key={day.id} value={day.id}>
            {day.label_ar || day.label_en ? pickLocale(day, locale, "label") : t("dayFallback", { n: day.day_index })}
          </option>
        ))}
      </select>
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchPlaceholder")} />
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setGroup(null)}
          className={`rounded-full px-2 py-0.5 text-xs ${
            group === null ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          {t("allGroups")}
        </button>
        {MUSCLE_GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroup(g)}
            className={`rounded-full px-2 py-0.5 text-xs ${
              group === g ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {tGroups(g)}
          </button>
        ))}
      </div>
      <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
        {isPending && <p className="p-3 text-center text-sm text-muted-foreground">{t("loading")}</p>}
        {!isPending && exercises?.length === 0 && (
          <p className="p-3 text-center text-sm text-muted-foreground">{t("noResults")}</p>
        )}
        {exercises?.map((exercise) => (
          <button
            key={exercise.id}
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(EXERCISE_DRAG_MIME, JSON.stringify(exercise));
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => setPicked(exercise)}
            className="flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-muted active:cursor-grabbing"
          >
            <span className="min-w-0 flex-1 truncate">{pickLocale(exercise, locale)}</span>
          </button>
        ))}
      </div>

      {picked && dayId && (
        <ItemDialog
          locale={locale}
          programId={programId}
          dayId={dayId}
          initialExercise={picked}
          open={!!picked}
          onOpenChange={(open) => !open && setPicked(null)}
        />
      )}
    </div>
  );
}
