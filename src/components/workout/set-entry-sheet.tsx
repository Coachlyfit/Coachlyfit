"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScaleButtons } from "@/components/ui/scale-buttons";
import {
  dockOrder,
  dockStep,
  fieldLabelKey,
  fieldSnap,
  inputRule,
  measurementFields,
  type MeasureField,
} from "@/domain/library/measurement";
import { stepValue } from "@/domain/workouts/session-runner";
import type { MeasureDraft } from "@/domain/workouts/set-measures";
import { cn } from "@/lib/utils";

export type SetSide = "left" | "right";
export type SetKind = "warmup" | "drop" | "failure";

export const SET_KINDS: SetKind[] = ["warmup", "drop", "failure"];
export const SET_SIDES: SetSide[] = ["left", "right"];

/** Everything the sheet edits. `draft` holds the measures as the client types
 * them (entered units — minutes, km, positive assistance); the caller turns it
 * into stored units with measuresFromDraft. */
export type LoggedSetValues = {
  draft: MeasureDraft;
  rpe: number | null;
  rir: number | null;
  notes: string | null;
  side: SetSide | null;
  set_type: SetKind | null;
};

/** A single-choice chip row where tapping the selected chip clears it. */
function ChipRow<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(value === o.value ? null : o.value)}
            className={cn(
              "h-11 flex-1 rounded-[9px] border px-3 text-sm font-medium transition-colors",
              value === o.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Body of the sheet, remounted (via the parent's `key`) each time the
 * client opens a different set — that's what re-seeds the fields from
 * `initial` without an effect syncing external state into local state on
 * every open. Which inputs appear comes from the exercise's measurement
 * type (reps, a hold time, a distance, calories...); weight stays available
 * wherever the type has it, including a weighted hold. */
function SetEntryForm({
  initial,
  type,
  block,
  weightLabel,
  onSave,
  onDelete,
  saving,
}: {
  initial: LoggedSetValues;
  type: unknown;
  block: string | null | undefined;
  /** Overrides the weight field's label (e.g. "Extra weight (kg)" for a
   * bodyweight exercise). */
  weightLabel?: string;
  onSave: (values: LoggedSetValues) => void;
  onDelete?: () => void;
  saving?: boolean;
}) {
  const t = useTranslations("client.workout.setEntry");
  const tm = useTranslations("measure");
  const fields = dockOrder(measurementFields(type, block));
  const [draft, setDraft] = useState<MeasureDraft>(initial.draft);
  const [rpe, setRpe] = useState<number | null>(initial.rpe);
  const [rir, setRir] = useState<number | null>(initial.rir);
  const [side, setSide] = useState<SetSide | null>(initial.side);
  const [setType, setSetType] = useState<SetKind | null>(initial.set_type);
  const [notes, setNotes] = useState(initial.notes ?? "");

  const labelOf = (f: MeasureField) =>
    f === "weight" && weightLabel ? weightLabel : tm(`fields.${fieldLabelKey(type, f, block)}`);

  function handleSave() {
    onSave({
      draft,
      rpe,
      rir,
      side,
      set_type: setType,
      notes: notes.trim() === "" ? null : notes.trim(),
    });
  }

  return (
    <>
      <SheetTitle>{t("title")}</SheetTitle>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const rule = inputRule(type, f, block);
          const step = dockStep(type, f, block);
          const snap = fieldSnap(type, f, block);
          return (
            <div key={f} className="flex flex-col items-center gap-2">
              <p className="text-xs font-medium text-muted-foreground">{labelOf(f)}</p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setDraft((d) => ({ ...d, [f]: stepValue(d[f] ?? "", -step, snap) }))}
                  aria-label={t("decrease")}
                >
                  <Minus className="size-4" />
                </Button>
                <Input
                  inputMode={rule.integer ? "numeric" : "decimal"}
                  value={draft[f] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))}
                  className="h-12 w-20 text-center text-lg font-semibold"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setDraft((d) => ({ ...d, [f]: stepValue(d[f] ?? "", step, snap) }))}
                  aria-label={t("increase")}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">{t("rpe")}</p>
        <ScaleButtons value={rpe ?? undefined} onChange={(v) => setRpe(rpe === v ? null : v)} min={6} max={10} />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">{tm("sheet.rir")}</p>
        <ScaleButtons value={rir ?? undefined} onChange={(v) => setRir(rir === v ? null : v)} min={0} max={5} />
      </div>

      <ChipRow
        label={tm("sheet.setType")}
        value={setType}
        onChange={setSetType}
        options={SET_KINDS.map((k) => ({ value: k, label: tm(`sheet.setTypes.${k}`) }))}
      />
      <ChipRow
        label={tm("sheet.side")}
        value={side}
        onChange={setSide}
        options={SET_SIDES.map((s) => ({ value: s, label: tm(`sheet.sides.${s}`) }))}
      />

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
  type,
  block,
  weightLabel,
  onSave,
  onDelete,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formKey: string;
  initial: LoggedSetValues;
  type: unknown;
  block: string | null | undefined;
  weightLabel?: string;
  onSave: (values: LoggedSetValues) => void;
  onDelete?: () => void;
  saving?: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex max-h-[92dvh] flex-col gap-5 overflow-y-auto rounded-t-2xl p-5">
        <SetEntryForm
          key={formKey}
          initial={initial}
          type={type}
          block={block}
          weightLabel={weightLabel}
          onSave={onSave}
          onDelete={onDelete}
          saving={saving}
        />
      </SheetContent>
    </Sheet>
  );
}
