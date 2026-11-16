"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Dumbbell } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { SWAP_REASONS, type SwapReason } from "@/domain/workouts/swap-reasons";
import { resolveSwapOptions } from "@/domain/workouts/swap-suggestions";
import { resolveExerciseMedia } from "@/lib/video-embed";
import type { Database } from "@/lib/supabase/database.types";
import { searchExercisesAction } from "@/domain/library/library-actions";

export type SwapExercise = Pick<
  Database["public"]["Tables"]["exercises"]["Row"],
  | "id"
  | "name_ar"
  | "name_en"
  | "muscle_group"
  | "equipment"
  | "primary_muscles"
  | "video_url"
  | "image_url"
  | "thumbnail_url"
  | "cues_ar"
  | "cues_en"
  | "steps_ar"
  | "steps_en"
  | "mistakes_ar"
  | "mistakes_en"
  | "safety_ar"
  | "safety_en"
  | "tempo"
  | "measurement_type"
>;

/** Mid-session exercise substitution — see workouts.service.ts's
 * substituted_exercise_id / swap_reason. Two steps: pick an exercise, then
 * (optionally) say why.
 *
 * What it offers: the coach's alternatives for this exercise if any are
 * defined (per-client override, else library), otherwise suggestions — same
 * primary muscle, different equipment (swap-suggestions.ts). Typing searches
 * the whole library instead. The search reuses searchExercisesAction from
 * src/domain/library/library-actions.ts: a plain RLS-scoped read ("exercises.
 * read_own_and_global" already includes clients via private.tenant_id()),
 * imported from src/domain so this client-facing component never depends on a
 * coach route's write actions. */
export function ExerciseSwapSheet({
  locale,
  open,
  onOpenChange,
  original,
  activeExerciseId,
  alternatives,
  onSelect,
  onUseOriginal,
}: {
  locale: AppLocale;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The planned exercise: the thing being replaced. */
  original: SwapExercise | null;
  activeExerciseId: string;
  /** The coach's alternatives for the planned exercise (may be empty). */
  alternatives: SwapExercise[];
  onSelect: (exercise: SwapExercise, reason: SwapReason | null) => void;
  onUseOriginal: () => void;
}) {
  const t = useTranslations("client.workout");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<SwapExercise | null>(null);
  const [reason, setReason] = useState<SwapReason | "">("");
  const debounced = useDebouncedValue(query.trim(), 300);
  const BackIcon = locale === "ar" ? ChevronRight : ChevronLeft;

  const reset = () => {
    setQuery("");
    setPicked(null);
    setReason("");
  };

  // Fallback suggestions are only needed when the coach defined none, and
  // only while the client isn't searching.
  const needSuggestions = open && !!original && alternatives.length === 0 && !debounced;
  const suggestionPool = useQuery({
    queryKey: ["workout", "swap-suggestions", original?.muscle_group ?? null],
    queryFn: () => searchExercisesAction({ group: original?.muscle_group ?? undefined, source: "all", pageSize: 50 }),
    enabled: needSuggestions,
  });
  const search = useQuery({
    queryKey: ["workout", "exercise-swap", debounced],
    queryFn: () => searchExercisesAction({ query: debounced, source: "all", pageSize: 50 }),
    enabled: open && !!debounced,
  });

  const { source, options } = original
    ? resolveSwapOptions(original, alternatives, (suggestionPool.data?.rows ?? []) as SwapExercise[])
    : { source: "suggested" as const, options: [] as SwapExercise[] };
  const searching = !!debounced;
  const list = searching ? ((search.data?.rows ?? []) as SwapExercise[]).filter((e) => e.id !== original?.id) : options;
  const loading = searching ? search.isPending : alternatives.length === 0 && suggestionPool.isPending;

  function confirm(chosen: SwapExercise, why: SwapReason | null) {
    reset();
    onSelect(chosen, why);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent side="bottom" className="h-auto max-h-[85dvh] rounded-t-2xl border-white/10 bg-[#020617] text-[#E2E8F0]">
        {picked ? (
          <div className="flex flex-col gap-3 px-1 pb-2">
            <SheetTitle className="font-mono text-[10px] tracking-wider text-[#64748B] uppercase">
              {t("swapReasonTitle")}
            </SheetTitle>
            <p className="text-[13.5px]">{t("swapReasonHint", { name: pickLocale(picked, locale) })}</p>

            <RadioGroup
              value={reason}
              onValueChange={(value) => setReason(value as SwapReason)}
              aria-label={t("swapReasonTitle")}
              className="gap-1.5"
            >
              {SWAP_REASONS.map((value) => (
                <Label
                  key={value}
                  className="flex h-11 cursor-pointer items-center gap-3 rounded-[10px] border border-[#1E293B] px-3 text-[13.5px] font-normal has-data-checked:border-primary has-data-checked:bg-primary/15"
                >
                  <RadioGroupItem value={value} />
                  {t(`swapReason.${value}`)}
                </Label>
              ))}
            </RadioGroup>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-11 px-3 text-[#E2E8F0]"
                onClick={() => setPicked(null)}
                aria-label={t("swapBack")}
              >
                <BackIcon className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 border-[#1E293B] bg-transparent text-[#E2E8F0]"
                onClick={() => confirm(picked, null)}
              >
                {t("swapSkipReason")}
              </Button>
              <Button type="button" className="h-11 flex-1" disabled={!reason} onClick={() => confirm(picked, reason || null)}>
                {t("swapConfirm")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 px-1 pb-2">
            <SheetTitle className="font-mono text-[10px] tracking-wider text-[#64748B] uppercase">
              {t("swapTitle")}
            </SheetTitle>

            {activeExerciseId !== original?.id && (
              <button
                type="button"
                onClick={() => {
                  reset();
                  onUseOriginal();
                }}
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

            {!searching && (
              <p className="font-mono text-[10px] tracking-wider text-[#64748B] uppercase">
                {source === "coach" ? t("swapCoachPicks") : t("swapSuggestions")}
              </p>
            )}

            <div className="flex max-h-[40dvh] flex-col gap-1 overflow-y-auto">
              {loading && <p className="p-3 text-center text-sm text-[#64748B]">{t("searching")}</p>}
              {!loading && list.length === 0 && (
                <p className="p-3 text-center text-sm text-[#64748B]">{t("noExercisesMatch")}</p>
              )}
              {list.map((exercise) => {
                const media = resolveExerciseMedia(exercise.thumbnail_url || exercise.image_url || exercise.video_url);
                return (
                  <button
                    key={exercise.id}
                    type="button"
                    onClick={() => setPicked(exercise)}
                    className={`flex w-full items-center gap-2 rounded-[10px] px-3 py-2.5 text-start text-[13.5px] ${
                      exercise.id === activeExerciseId ? "bg-primary/15 text-primary" : "text-[#E2E8F0]"
                    }`}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-[#1E293B]">
                      {media?.kind === "image" ? (
                        <img
                          src={media.src}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Dumbbell className="size-4 text-[#64748B]" aria-hidden="true" />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{pickLocale(exercise, locale)}</span>
                      {exercise.equipment && (
                        <span className="truncate text-xs text-[#64748B]">{exercise.equipment}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
