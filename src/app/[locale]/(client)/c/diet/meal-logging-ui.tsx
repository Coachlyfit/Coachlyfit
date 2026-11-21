"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Droplet, Flame, StickyNote, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { WATER_CUP_ML, type MealStatus } from "@/domain/nutrition/meal-logging";
import { clearMealAction, setMealStatusAction, setWaterCupsAction } from "./actions";

export type MealMark = { status: MealStatus; note: string | null };

type ActionResult = { error: string } | void;

const MAX_GLASSES = 16;
const MAX_CUPS = 40;

/** Runs a server action in a transition. `optimistic` runs first, inside the
 * transition, so the page updates at once and snaps back if the action fails. */
function useRun() {
  const t = useTranslations("client.diet.log");
  const [pending, startTransition] = useTransition();
  function run(optimistic: () => void, action: () => Promise<ActionResult>, after?: () => void) {
    startTransition(async () => {
      optimistic();
      const res = await action();
      if (res?.error) toast.error(t("error"));
      else after?.();
    });
  }
  return { pending, run };
}

function Fill({ value, max, label, className }: { value: number; max: number; label: string; className: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
    >
      <div className={cn("h-full rounded-full transition-[width] duration-700", className)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Two rows under the header: meals done and water drunk, each with a fill bar. */
export function ProgressStrip({
  locale,
  done,
  total,
  waterMl,
  waterTargetMl,
}: {
  locale: AppLocale;
  done: number;
  total: number;
  waterMl: number;
  waterTargetMl: number;
}) {
  const t = useTranslations("client.diet.log");
  const liters = (ml: number) => formatNumber(ml / 1000, locale, { maximumFractionDigits: 2 });

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <Flame className="size-[18px] shrink-0 text-nutri-orange" aria-hidden />
        <Fill value={done} max={total} label={t("mealsProgress")} className="bg-gradient-to-r from-nutri-orange to-orange-300" />
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{t("summary", { done, total })}</span>
      </div>
      <div className="flex items-center gap-3">
        <Droplet className="size-[18px] shrink-0 text-nutri-blue" aria-hidden />
        <Fill value={waterMl} max={waterTargetMl} label={t("waterProgress")} className="bg-gradient-to-r from-nutri-blue to-sky-300" />
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {t("water", { current: liters(waterMl), target: liters(waterTargetMl) })}
        </span>
      </div>
    </div>
  );
}

/** Eight-ish glasses (the daily goal in cups): tap one to fill up to it, tap
 * the last filled one to empty it, plus + cup and undo. */
export function WaterCard({
  locale,
  date,
  waterMl,
  waterTargetMl,
  onCups,
}: {
  locale: AppLocale;
  date: string;
  waterMl: number;
  waterTargetMl: number;
  /** Optimistic update of the page's water total, in cups. */
  onCups: (cups: number) => void;
}) {
  const t = useTranslations("client.diet.log");
  const { pending, run } = useRun();
  const cups = Math.round(waterMl / WATER_CUP_ML);
  const glasses = Math.min(MAX_GLASSES, Math.max(1, Math.ceil(waterTargetMl / WATER_CUP_ML)));
  const liters = (ml: number) => formatNumber(ml / 1000, locale, { maximumFractionDigits: 2 });

  function setCups(next: number) {
    run(
      () => onCups(next),
      () => setWaterCupsAction(locale, { log_date: date, cups: next })
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-labelledby="water-title">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl" aria-hidden>
            💧
          </span>
          <div>
            <h2 id="water-title" className="text-[15px] font-semibold">
              {t("waterTitle")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("waterTarget", { target: liters(waterTargetMl) })}</p>
          </div>
        </div>
        <p className="font-mono text-[22px] font-medium tabular-nums text-nutri-blue">
          {liters(waterMl)} <span className="text-[13px] text-muted-foreground">{t("liter")}</span>
        </p>
      </div>

      <div className="mb-4 grid grid-cols-8 gap-1.5">
        {Array.from({ length: glasses }, (_, i) => {
          const filled = i < cups;
          return (
            <button
              key={i}
              type="button"
              disabled={pending}
              aria-pressed={filled}
              aria-label={t("glass", { n: i + 1, total: glasses })}
              onClick={() => setCups(i + 1 === cups ? i : i + 1)}
              className={cn(
                "flex aspect-square items-center justify-center rounded-lg border-[1.5px] text-[15px] transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                filled ? "border-nutri-blue/50 bg-nutri-blue/10" : "border-border"
              )}
            >
              {filled && <span aria-hidden>💧</span>}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-[1fr_2.75rem] gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending || cups >= MAX_CUPS}
          onClick={() => setCups(cups + 1)}
          className="min-h-11 border-nutri-blue/30 bg-nutri-blue/10 font-semibold text-nutri-blue hover:bg-nutri-blue/20 hover:text-nutri-blue"
        >
          {t("addCup", { ml: formatNumber(WATER_CUP_ML, locale) })}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={pending || cups === 0}
          aria-label={t("undoCup")}
          onClick={() => setCups(cups - 1)}
          className="size-11 text-muted-foreground"
        >
          <Undo2 className="size-4 rtl:-scale-x-100" aria-hidden />
        </Button>
      </div>
    </section>
  );
}

/** Done / Skip / note for one meal. Done and Skip toggle (tap the active one
 * again to clear); the note opens a bottom sheet and needs a status first,
 * since a note is stored on the meal's mark. */
export function MealActions({
  locale,
  date,
  mealId,
  mealName,
  mark,
  onMark,
}: {
  locale: string;
  date: string;
  mealId: string;
  mealName: string;
  mark: MealMark | null;
  /** Optimistic update of this meal's mark on the page. */
  onMark: (mark: MealMark | null) => void;
}) {
  const t = useTranslations("client.diet.log");
  const { pending, run } = useRun();
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");

  function toggle(status: MealStatus) {
    if (mark?.status === status) {
      run(
        () => onMark(null),
        () => clearMealAction(locale, { meal_id: mealId, log_date: date })
      );
    } else {
      run(
        () => onMark({ status, note: mark?.note ?? null }),
        () => setMealStatusAction(locale, { meal_id: mealId, log_date: date, status, note: mark?.note ?? "" })
      );
    }
  }

  function saveNote() {
    if (!mark) return;
    const next = note.trim();
    run(
      () => onMark({ status: mark.status, note: next || null }),
      () => setMealStatusAction(locale, { meal_id: mealId, log_date: date, status: mark.status, note: next }),
      () => setNoteOpen(false)
    );
  }

  return (
    <>
      <div className="grid grid-cols-[1fr_1fr_2.75rem] gap-2 border-t border-border px-4 pb-3.5 pt-3">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          aria-pressed={mark?.status === "eaten"}
          onClick={() => toggle("eaten")}
          className={cn(
            "min-h-11 font-semibold",
            mark?.status === "eaten"
              ? "border-nutri-green bg-nutri-green text-[#0a1a12] hover:bg-nutri-green/90 hover:text-[#0a1a12]"
              : "text-muted-foreground"
          )}
        >
          <Check className="size-4" aria-hidden />
          {t("done")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          aria-pressed={mark?.status === "skipped"}
          onClick={() => toggle("skipped")}
          className={cn("min-h-11 font-semibold text-muted-foreground", mark?.status === "skipped" && "bg-muted text-foreground")}
        >
          {t("skip")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={pending || !mark}
          aria-label={t("note")}
          title={mark ? undefined : t("noteNeedsStatus")}
          onClick={() => {
            setNote(mark?.note ?? "");
            setNoteOpen(true);
          }}
          className="size-11 text-muted-foreground"
        >
          <StickyNote className="size-4" aria-hidden />
        </Button>
      </div>

      <Sheet open={noteOpen} onOpenChange={setNoteOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{t("noteTitle", { meal: mealName })}</SheetTitle>
            <SheetDescription>{t("noteHelp")}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4 pb-4">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              rows={4}
              aria-label={t("note")}
              placeholder={t("notePlaceholder")}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={() => setNoteOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="button" className="min-h-11" disabled={pending} onClick={saveNote}>
                {t("saveNote")}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
