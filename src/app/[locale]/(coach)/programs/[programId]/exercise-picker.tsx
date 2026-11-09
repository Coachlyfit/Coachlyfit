"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Dumbbell } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { resolveExerciseMedia } from "@/lib/video-embed";
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

  const { data, isPending } = useQuery({
    queryKey: ["programs", "exercise-picker", debounced],
    queryFn: () => searchExercisesAction({ query: debounced, source: "all", pageSize: 50 }),
  });
  const exercises = data?.rows;

  /** When the exercise was pre-selected (e.g. picked from the sidebar before
   * this dialog opened) and the coach hasn't typed a search, show only that
   * exercise immediately instead of forcing them to scroll through or search
   * the full list again. A manual search still filters across every exercise
   * so they can change their mind if needed. `selectedId` keeps driving the
   * row highlight regardless. */
  const visibleExercises = useMemo(() => {
    const all = exercises ?? [];
    if (selectedId && !debounced.trim()) return all.filter((exercise) => exercise.id === selectedId);
    if (debounced.trim()) {
      const q = debounced.trim().toLowerCase();
      return all.filter((exercise) => pickLocale(exercise, locale).toLowerCase().includes(q));
    }
    return all;
  }, [exercises, selectedId, debounced, locale]);

  return (
    <div className="flex w-full flex-col gap-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchPlaceholder")}
      />
      <div className="flex max-h-72 w-full flex-col gap-1 overflow-y-auto rounded-md border border-border p-1">
        {isPending && (
          <p className="p-3 text-center text-sm text-muted-foreground">{t("loading")}</p>
        )}
        {!isPending && visibleExercises.length === 0 && (
          <p className="p-3 text-center text-sm text-muted-foreground">{t("noResults")}</p>
        )}
        {visibleExercises.map((exercise) => {
          const media = resolveExerciseMedia(
            exercise.thumbnail_url || exercise.image_url || exercise.video_url
          );
          return (
            <button
              key={exercise.id}
              type="button"
              onClick={() => onSelect(exercise)}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm hover:bg-muted ${
                selectedId === exercise.id ? "bg-primary/10 text-primary" : ""
              }`}
            >
              <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                {media?.kind === "image" ? (
                  <img
                    src={media.src}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Dumbbell className="size-4 text-muted-foreground/40" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">{pickLocale(exercise, locale)}</span>
              {exercise.muscle_group && <Badge variant="secondary">{exercise.muscle_group}</Badge>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
