"use client";

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { AlternativesEditor, type AlternativeRef } from "@/components/alternatives/alternatives-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getItemAlternativesAction, listLibraryAlternativesAction } from "@/domain/alternatives/alternatives-actions";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { setItemAlternativesAction } from "../actions";

/** The "Alternatives" section of the item dialog. A program item inherits its
 * exercise's library alternatives; for a client's program the coach can
 * override them for that item. The override saves on its own button (not with
 * the item form): it is its own table and works on an already-saved item. */
export function ItemAlternatives({
  locale,
  programId,
  item,
  exercise,
  clientProgram,
}: {
  locale: AppLocale;
  programId: string;
  /** The saved item being edited; undefined while adding a new one. */
  item?: { id: string; exercise_id: string };
  /** The exercise currently chosen in the dialog. */
  exercise: { id: string; muscle_group?: string | null } | null;
  clientProgram: boolean;
}) {
  const t = useTranslations("alternatives");
  const tErrors = useTranslations("programs.errors");
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<AlternativeRef[] | null>(null);

  // The override belongs to the saved exercise: until the coach saves a
  // changed exercise, there is nothing to customize.
  const savedExerciseChosen = !!item && exercise?.id === item.exercise_id;
  const canCustomize = clientProgram && savedExerciseChosen;
  const queryKey = ["alternatives", "item", item?.id ?? null, exercise?.id ?? null];

  const { data, isPending } = useQuery({
    queryKey,
    queryFn: async () => {
      if (item && savedExerciseChosen) return getItemAlternativesAction(item.id, item.exercise_id);
      return { inherited: await listLibraryAlternativesAction(exercise!.id), override: [] };
    },
    enabled: !!exercise,
  });

  if (!exercise) return null;

  const override = data?.override ?? [];
  const shown = override.length > 0 ? override : (data?.inherited ?? []);

  function save(next: AlternativeRef[]) {
    if (!item) return;
    startTransition(async () => {
      const result = await setItemAlternativesAction(
        locale,
        programId,
        item.id,
        item.exercise_id,
        next.map((a) => a.id)
      );
      if (result?.error) {
        toast.error(tErrors.has(result.error) ? tErrors(result.error) : tErrors("invalid_input"));
        return;
      }
      toast.success(next.length === 0 ? t("resetDone") : t("saved"));
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["alternatives", "item", item.id] });
    });
  }

  return (
    <details className="group rounded-xl bg-muted/40">
      <summary className="flex h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span>
          {t("title")}{" "}
          <span className="font-normal text-muted-foreground">
            {isPending ? "" : `(${shown.length})`}
          </span>
        </span>
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="flex flex-col gap-3 px-3 pb-3">
        {draft ? (
          <>
            <AlternativesEditor
              locale={locale}
              exerciseId={exercise.id}
              muscleGroup={exercise.muscle_group}
              value={draft}
              onChange={setDraft}
              disabled={pending}
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={pending} onClick={() => save(draft)}>
                {t("saveOverride")}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setDraft(null)}>
                {t("cancel")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={override.length > 0 ? "warning" : "secondary"}>
                {override.length > 0 ? t("customized") : t("inherited")}
              </Badge>
              {!clientProgram && <span className="text-xs text-muted-foreground">{t("templateHint")}</span>}
              {clientProgram && !item && <span className="text-xs text-muted-foreground">{t("saveFirstHint")}</span>}
            </div>
            {isPending ? (
              <p className="text-sm text-muted-foreground">{t("loading")}</p>
            ) : shown.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            ) : (
              <ol className="flex flex-col gap-1">
                {shown.map((alt, i) => (
                  <li key={alt.id} className="flex items-center gap-2 text-sm">
                    <span className="w-5 shrink-0 text-center font-mono text-xs text-muted-foreground">{i + 1}</span>
                    <span className="truncate">{pickLocale(alt, locale)}</span>
                  </li>
                ))}
              </ol>
            )}
            {canCustomize && !isPending && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setDraft([...shown])}>
                  {t("customize")}
                </Button>
                {override.length > 0 && (
                  <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => save([])}>
                    {t("resetToLibrary")}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}
