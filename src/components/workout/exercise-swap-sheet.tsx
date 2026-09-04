"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { Database } from "@/lib/supabase/database.types";
import { searchExercisesAction } from "@/domain/library/library-actions";

export type SwapExercise = Pick<
  Database["public"]["Tables"]["exercises"]["Row"],
  | "id"
  | "name_ar"
  | "name_en"
  | "muscle_group"
  | "video_url"
  | "cues_ar"
  | "cues_en"
  | "steps_ar"
  | "steps_en"
  | "mistakes_ar"
  | "mistakes_en"
  | "safety_ar"
  | "safety_en"
  | "tempo"
>;

/** Session-only exercise substitution — see workouts.service.ts's
 * substituted_exercise_id. Reuses searchExercisesAction from
 * src/domain/library/library-actions.ts: a plain RLS-scoped read
 * (exercises' read_own_and_global policy already includes clients via
 * private.tenant_id()), not a coach-only action, same library the coach's
 * own ExercisePicker searches — imported from src/domain rather than the
 * (coach) route so this client-facing component never depends on a coach
 * route's write actions. */
export function ExerciseSwapSheet({
  locale,
  open,
  onOpenChange,
  originalExerciseId,
  activeExerciseId,
  muscleGroup,
  onSelect,
  onUseOriginal,
}: {
  locale: AppLocale;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalExerciseId: string;
  activeExerciseId: string;
  muscleGroup: string | null;
  onSelect: (exercise: SwapExercise) => void;
  onUseOriginal: () => void;
}) {
  const t = useTranslations("client.workout");
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 300);

  // muscleGroup is a browse-time default (relevant suggestions before the
  // client types anything) — once they search, it's dropped so free-text
  // search covers the full library instead of AND-ing with a group that
  // might not match what they're looking for.
  const { data, isPending } = useQuery({
    queryKey: ["workout", "exercise-swap", muscleGroup, debounced],
    queryFn: () =>
      searchExercisesAction({
        query: debounced,
        group: debounced ? undefined : (muscleGroup ?? undefined),
        source: "all",
        pageSize: 50,
      }),
    enabled: open,
  });
  const exercises = data?.rows;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[85dvh] rounded-t-2xl border-white/10 bg-[#020617] text-[#E2E8F0]">
        <div className="flex flex-col gap-3 px-1 pb-2">
          <SheetTitle className="font-mono text-[10px] tracking-wider text-[#64748B] uppercase">
            {t("swapTitle")}
          </SheetTitle>

          {activeExerciseId !== originalExerciseId && (
            <button
              type="button"
              onClick={onUseOriginal}
              className="flex h-11 items-center justify-center rounded-[10px] border border-[#1E293B] text-[13px] font-medium text-primary"
            >
              {t("useOriginal")}
            </button>
          )}

          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchExercises")}
            className="border-[#1E293B] bg-[#0F172A] text-[#E2E8F0] placeholder:text-[#64748B]"
          />

          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {isPending && <p className="p-3 text-center text-sm text-[#64748B]">{t("searching")}</p>}
            {!isPending && exercises?.length === 0 && (
              <p className="p-3 text-center text-sm text-[#64748B]">{t("noExercisesMatch")}</p>
            )}
            {exercises?.map((exercise) => (
              <button
                key={exercise.id}
                type="button"
                onClick={() => onSelect(exercise)}
                className={`flex w-full items-center rounded-[10px] px-3 py-2.5 text-start text-[13.5px] ${
                  exercise.id === activeExerciseId ? "bg-primary/15 text-primary" : "text-[#E2E8F0]"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{pickLocale(exercise, locale)}</span>
              </button>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
