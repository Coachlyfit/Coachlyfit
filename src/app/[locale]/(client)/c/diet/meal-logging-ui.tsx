"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Droplets, Plus, SkipForward, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import type { MealStatus } from "@/domain/nutrition/meal-logging";
import { addWaterAction, clearMealAction, setMealStatusAction } from "./actions";

export type MealMark = { status: MealStatus; note: string | null };

type ActionResult = { error: string } | void;

function useRun() {
  const t = useTranslations("client.diet.log");
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<ActionResult>, after?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (res?.error) toast.error(t("error"));
      else after?.();
    });
  }
  return { pending, run };
}

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className="h-1.5 overflow-hidden rounded-full bg-muted"
    >
      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** "3/4 meals completed · 1.5 L / 2 L water" with the + cup button. Today only. */
export function TodaySummary({
  locale,
  date,
  done,
  total,
  waterMl,
  waterTargetMl,
}: {
  locale: AppLocale;
  date: string;
  done: number;
  total: number;
  waterMl: number;
  waterTargetMl: number;
}) {
  const t = useTranslations("client.diet.log");
  const { pending, run } = useRun();
  const liters = (ml: number) => formatNumber(ml / 1000, locale, { maximumFractionDigits: 2 });

  return (
    <Card className="gap-3 px-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">
          {t("summary", { done, total })} · {t("water", { current: liters(waterMl), target: liters(waterTargetMl) })}
        </p>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          disabled={pending}
          aria-label={t("addCup")}
          onClick={() => run(() => addWaterAction(locale, { log_date: date }))}
        >
          <Plus className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <Bar value={done} max={total} label={t("mealsProgress")} />
        <div className="flex items-center gap-2">
          <Droplets className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="flex-1">
            <Bar value={waterMl} max={waterTargetMl} label={t("waterProgress")} />
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Done / Skip buttons for one meal, plus a note once it has a status.
 * Tapping the active button again clears the mark. */
export function MealLogControls({
  locale,
  date,
  mealId,
  mark,
}: {
  locale: string;
  date: string;
  mealId: string;
  mark: MealMark | null;
}) {
  const t = useTranslations("client.diet.log");
  const { pending, run } = useRun();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(mark?.note ?? "");

  function toggle(status: MealStatus) {
    run(() =>
      mark?.status === status
        ? clearMealAction(locale, { meal_id: mealId, log_date: date })
        : setMealStatusAction(locale, { meal_id: mealId, log_date: date, status, note: mark?.note ?? "" })
    );
  }

  return (
    <div className="flex flex-col gap-2 pt-1">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="min-h-11 flex-1"
          variant={mark?.status === "eaten" ? "default" : "outline"}
          aria-pressed={mark?.status === "eaten"}
          disabled={pending}
          onClick={() => toggle("eaten")}
        >
          <Check className="size-4" aria-hidden />
          {t("done")}
        </Button>
        <Button
          type="button"
          className="min-h-11"
          variant={mark?.status === "skipped" ? "secondary" : "outline"}
          aria-pressed={mark?.status === "skipped"}
          disabled={pending}
          onClick={() => toggle("skipped")}
        >
          <SkipForward className="size-4" aria-hidden />
          {t("skip")}
        </Button>
        {mark && (
          <Button type="button" className="min-h-11" variant="ghost" disabled={pending} onClick={() => setEditing((v) => !v)}>
            <StickyNote className="size-4" aria-hidden />
            {t("note")}
          </Button>
        )}
      </div>

      {mark?.note && !editing && <p className="text-sm text-muted-foreground">{mark.note}</p>}

      {mark && editing && (
        <div className="flex flex-col gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            rows={2}
            aria-label={t("note")}
            placeholder={t("notePlaceholder")}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            type="button"
            size="sm"
            className="self-start"
            disabled={pending}
            onClick={() =>
              run(
                () => setMealStatusAction(locale, { meal_id: mealId, log_date: date, status: mark.status, note }),
                () => setEditing(false)
              )
            }
          >
            {t("saveNote")}
          </Button>
        </div>
      )}
    </div>
  );
}
