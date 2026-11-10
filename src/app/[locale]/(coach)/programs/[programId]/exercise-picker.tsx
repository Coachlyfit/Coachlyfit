"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { searchExercisesAction } from "../../library/actions";
import { ExerciseRow, type PickedExercise } from "./exercise-media";

/** Reuses the library's existing search action rather than adding a
 * duplicate — it's already a plain RLS-scoped read with no auth side effect.
 * Shown only while the coach is browsing (no exercise chosen yet, or after
 * "change exercise"), so it always lists everything matching the query. */
export function ExercisePicker({
  locale,
  selectedId,
  onSelect,
}: {
  locale: AppLocale;
  selectedId: string | null;
  onSelect: (exercise: PickedExercise) => void;
}) {
  const t = useTranslations("programs.itemDialog");
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 300);

  const { data, isPending } = useQuery({
    queryKey: ["programs", "exercise-picker", debounced],
    queryFn: () => searchExercisesAction({ query: debounced, source: "all", pageSize: 50 }),
  });
  const exercises = data?.rows;

  const visibleExercises = useMemo(() => {
    const all = exercises ?? [];
    const q = debounced.trim().toLowerCase();
    return q ? all.filter((exercise) => pickLocale(exercise, locale).toLowerCase().includes(q)) : all;
  }, [exercises, debounced, locale]);

  return (
    <div className="flex w-full flex-col gap-2">
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchPlaceholder")} autoFocus />
      <div className="flex max-h-[28rem] w-full flex-col gap-1 overflow-y-auto rounded-md border border-border p-1">
        {isPending && <p className="p-3 text-center text-sm text-muted-foreground">{t("loading")}</p>}
        {!isPending && visibleExercises.length === 0 && (
          <p className="p-3 text-center text-sm text-muted-foreground">{t("noResults")}</p>
        )}
        {visibleExercises.map((exercise) => (
          <ExerciseRow
            key={exercise.id}
            exercise={exercise}
            locale={locale}
            selected={selectedId === exercise.id}
            onClick={() => onSelect(exercise)}
          />
        ))}
      </div>
    </div>
  );
}
