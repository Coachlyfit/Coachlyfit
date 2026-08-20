"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { searchExercisesAction } from "../../library/actions";

/** Reuses the library's existing search action rather than adding a
 * duplicate — it's already a plain RLS-scoped read with no auth side effect. */
export function ExercisePicker({
  locale,
  selectedId,
  onSelect,
}: {
  locale: AppLocale;
  selectedId: string | null;
  onSelect: (exercise: { id: string; name_ar: string; name_en: string }) => void;
}) {
  const t = useTranslations("programs.itemDialog");
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 300);

  const { data } = useQuery({
    queryKey: ["programs", "exercise-picker", debounced],
    queryFn: () => searchExercisesAction({ query: debounced, source: "all", pageSize: 50 }),
  });
  const exercises = data?.rows;

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchPlaceholder")}
      />
      <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border border-border p-1">
        {exercises?.length === 0 && (
          <p className="p-3 text-center text-sm text-muted-foreground">{t("noResults")}</p>
        )}
        {exercises?.map((exercise) => (
          <button
            key={exercise.id}
            type="button"
            onClick={() => onSelect(exercise)}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-start text-sm hover:bg-muted ${
              selectedId === exercise.id ? "bg-primary/10 text-primary" : ""
            }`}
          >
            <span className="flex-1 truncate">{pickLocale(exercise, locale)}</span>
            {exercise.muscle_group && <Badge variant="secondary">{exercise.muscle_group}</Badge>}
          </button>
        ))}
      </div>
    </div>
  );
}
