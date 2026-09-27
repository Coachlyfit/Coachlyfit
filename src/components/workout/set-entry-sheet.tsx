"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScaleButtons } from "@/components/ui/scale-buttons";

export type LoggedSetValues = {
  weight: number | null;
  reps: number | null;
  duration_seconds: number | null;
  rpe: number | null;
  notes: string | null;
};

/** Body of the sheet, remounted (via the parent's `key`) each time the
 * client opens a different set — that's what re-seeds weight/reps/rpe/notes
 * from `initial` without an effect syncing external state into local state
 * on every open. `mode` picks reps vs a duration (seconds) counter for a
 * rehab hold/stretch — never both, same xor the DB enforces on
 * program_item_sets. Weight stays available either way: a duration hold
 * can still be weighted (e.g. a weighted plank). */
function SetEntryForm({
  initial,
  mode,
  onSave,
  onDelete,
  saving,
}: {
  initial: LoggedSetValues;
  mode: "reps" | "duration";
  onSave: (values: LoggedSetValues) => void;
  onDelete?: () => void;
  saving?: boolean;
}) {
  const t = useTranslations("client.workout.setEntry");
  const [weight, setWeight] = useState(initial.weight != null ? String(initial.weight) : "");
  const [reps, setReps] = useState(initial.reps != null ? String(initial.reps) : "");
  const [durationSeconds, setDurationSeconds] = useState(
    initial.duration_seconds != null ? String(initial.duration_seconds) : ""
  );
  const [rpe, setRpe] = useState<number | null>(initial.rpe);
  const [notes, setNotes] = useState(initial.notes ?? "");

  function adjustWeight(delta: number) {
    const current = Number(weight) || 0;
    setWeight(String(Math.max(0, current + delta)));
  }

  function adjustReps(delta: number) {
    const current = Number(reps) || 0;
    setReps(String(Math.max(0, current + delta)));
  }

  function adjustDuration(delta: number) {
    const current = Number(durationSeconds) || 0;
    setDurationSeconds(String(Math.max(0, current + delta)));
  }

  function handleSave() {
    onSave({
      weight: weight.trim() === "" ? null : Number(weight),
      reps: mode === "reps" ? (reps.trim() === "" ? null : Number(reps)) : null,
      duration_seconds: mode === "duration" ? (durationSeconds.trim() === "" ? null : Number(durationSeconds)) : null,
      rpe,
      notes: notes.trim() === "" ? null : notes.trim(),
    });
  }

  return (
    <>
      <SheetTitle>{t("title")}</SheetTitle>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground">{t("weight")}</p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="icon" onClick={() => adjustWeight(-2.5)} aria-label={t("decrease")}>
              <Minus className="size-4" />
            </Button>
            <Input
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="h-12 w-20 text-center text-lg font-semibold"
            />
            <Button type="button" variant="outline" size="icon" onClick={() => adjustWeight(2.5)} aria-label={t("increase")}>
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        {mode === "duration" ? (
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground">{t("durationSeconds")}</p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" onClick={() => adjustDuration(-5)} aria-label={t("decrease")}>
                <Minus className="size-4" />
              </Button>
              <Input
                inputMode="numeric"
                value={durationSeconds}
                onChange={(e) => setDurationSeconds(e.target.value)}
                className="h-12 w-20 text-center text-lg font-semibold"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => adjustDuration(5)} aria-label={t("increase")}>
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground">{t("reps")}</p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" onClick={() => adjustReps(-1)} aria-label={t("decrease")}>
                <Minus className="size-4" />
              </Button>
              <Input
                inputMode="numeric"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                className="h-12 w-20 text-center text-lg font-semibold"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => adjustReps(1)} aria-label={t("increase")}>
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">{t("rpe")}</p>
        <ScaleButtons value={rpe ?? undefined} onChange={(v) => setRpe(rpe === v ? null : v)} min={6} max={10} />
      </div>

      <Input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t("notesPlaceholder")}
        maxLength={500}
      />

      <div className="flex gap-2">
        {onDelete && (
          <Button type="button" variant="outline" size="icon" onClick={onDelete} disabled={saving} aria-label={t("delete")}>
            <Trash2 className="size-4" />
          </Button>
        )}
        <Button type="button" onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? t("saving") : t("save")}
        </Button>
      </div>
    </>
  );
}

/** Bottom sheet for entering (or editing) what a client actually did on a
 * set — replaces the old one-tap toggle that always posted the prescribed
 * reps and never sent weight at all. Prefilled from, in priority order: an
 * already-logged value for this exact set (editing), a suggestion computed
 * from the client's own history, or the coach's prescription.
 *
 * Pass a `formKey` unique to the set being edited (e.g. `${itemId}-${setIndex}`)
 * so SetEntryForm remounts with fresh state each time a different set opens. */
export function SetEntrySheet({
  open,
  onOpenChange,
  formKey,
  initial,
  mode = "reps",
  onSave,
  onDelete,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formKey: string;
  initial: LoggedSetValues;
  mode?: "reps" | "duration";
  onSave: (values: LoggedSetValues) => void;
  onDelete?: () => void;
  saving?: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex flex-col gap-5 rounded-t-2xl p-5">
        <SetEntryForm key={formKey} initial={initial} mode={mode} onSave={onSave} onDelete={onDelete} saving={saving} />
      </SheetContent>
    </Sheet>
  );
}
