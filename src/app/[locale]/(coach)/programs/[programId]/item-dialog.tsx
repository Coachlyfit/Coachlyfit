"use client";

import { useState, useTransition } from "react";
import { useForm, useFieldArray, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { ChevronDown, Plus, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { ProgressionRule } from "@/domain/programs/progression";
import { SET_TYPES } from "@/domain/programs/set-targets";
import {
  EXTRA_KEYS,
  fieldLabelKey,
  inputRule,
  isAssisted,
  isExtraField,
  measurementFields,
  durationUnit,
  type MeasureField,
} from "@/domain/library/measurement";
import { defaultEnteredSet, setToEntered, setToStored, type SetPayload } from "@/domain/workouts/set-measures";
import { itemSchema, type ItemFormInput } from "../schemas";
import { addItemAction, updateItemAction } from "../actions";
import { ExercisePicker } from "./exercise-picker";
import { ExerciseHero, useExerciseMeta, type PickedExercise } from "./exercise-media";

type ExistingItemSet = {
  reps: number | null;
  duration_seconds: number | null;
  weight: number | null;
  rest_seconds: number | null;
  distance_m: number | null;
  calories: number | null;
  extra: unknown;
  set_type: string;
  reps_max: number | null;
  pct_1rm: number | null;
  rpe_target: number | null;
  rir_target: number | null;
};
type ExistingItem = {
  id: string;
  exercise_id: string;
  progression_rule: string;
  notes_ar: string | null;
  notes_en: string | null;
  block: string;
  rehab_phase_id: string | null;
  coach_note_private: string | null;
  tempo: string | null;
  per_side: boolean;
  scaled_notes_ar: string | null;
  scaled_notes_en: string | null;
  exercises: PickedExercise;
  program_item_sets: ExistingItemSet[]; // must already be ordered by set_index
};

export type RehabPhaseOption = { id: string; name_ar: string; name_en: string };

const PROGRESSION_RULES: { value: ProgressionRule; labelKey: string }[] = [
  { value: "none", labelKey: "progressionNone" },
  { value: "plus_2_5kg_week", labelKey: "progressionPlus25" },
  { value: "plus_5kg_week", labelKey: "progressionPlus5" },
  { value: "plus_1_rep_week", labelKey: "progressionPlus1Rep" },
];

const BLOCKS = ["warmup", "main", "accessory", "finisher", "cooldown", "mobility", "rehab"] as const;

const SETS_GRID = "grid items-center gap-2";
/** Target column -> the set field it edits. */
const TARGET_FIELD = { repsMax: "reps_max", pct1rm: "pct_1rm", rpe: "rpe_target", rir: "rir_target" } as const;
// 44px tall with 16px text on mobile (no iOS zoom), denser from md up.
const SET_INPUT = "h-11 font-mono font-semibold tabular-nums md:h-9";

/** RHF path for a measure's input. Column fields map 1:1 to set keys;
 * extra metrics live under `extra`. (The cast is only because RHF's path
 * type can't see through the nullable `extra` object.) */
function setFieldPath(index: number, field: MeasureField) {
  const column: Partial<Record<MeasureField, string>> = {
    weight: "weight",
    reps: "reps",
    duration: "duration_seconds",
    distance: "distance_m",
    calories: "calories",
  };
  const path = isExtraField(field) ? `extra.${EXTRA_KEYS[field]}` : column[field];
  return `sets.${index}.${path}` as `sets.${number}.reps`;
}

const mono = (chunks: React.ReactNode) => (
  <bdi className="font-mono font-semibold tabular-nums text-foreground">{chunks}</bdi>
);

export function ItemDialog({
  locale,
  programId,
  dayId,
  item,
  initialExercise,
  initialBlock,
  rehabPhases = [],
  open,
  onOpenChange,
}: {
  locale: AppLocale;
  programId: string;
  dayId: string;
  item?: ExistingItem;
  /** Pre-selects an exercise on the "add" path — used by the exercise
   * sidebar's click-to-add, which already knows which exercise the coach
   * picked before this dialog even opens. Ignored when `item` is set. */
  initialExercise?: PickedExercise;
  /** Pre-selects the block on the "add" path — the day card's "+ Add"
   * menu's Mobility/Rehab entries open this dialog with the block already
   * chosen, same idea as initialExercise. Ignored when `item` is set. */
  initialBlock?: "warmup" | "main" | "cooldown" | "mobility" | "rehab";
  /** Every rehab phase on this program, across every protocol — shown as a
   * select only when block = 'rehab'. Empty when the program has no rehab
   * protocol yet; a rehab item can still be added without a phase (shows
   * on every week, see day-plan.ts's activePhase). */
  rehabPhases?: RehabPhaseOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("programs.itemDialog");
  const tm = useTranslations("measure");
  const tErrors = useTranslations("programs.errors");
  const tCommon = useTranslations("common");
  const exerciseMeta = useExerciseMeta();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [targetsOpen] = useState(
    () =>
      !!item &&
      item.program_item_sets.some(
        (s) => s.set_type !== "working" || s.reps_max != null || s.pct_1rm != null || s.rpe_target != null || s.rir_target != null
      )
  );
  const [selectedExercise, setSelectedExercise] = useState<PickedExercise | null>(
    item?.exercises ?? initialExercise ?? null
  );
  // Browsing = the media column shows the search list instead of the chosen
  // exercise; true until one is picked, and again after "change exercise".
  const [browsing, setBrowsing] = useState(!selectedExercise);
  // Computed once: the notes section opens by itself only when there is
  // something in it to see.
  const [notesOpen] = useState(
    () =>
      !!item &&
      !!(
        item.notes_ar ||
        item.notes_en ||
        item.coach_note_private ||
        item.tempo ||
        item.per_side ||
        item.scaled_notes_ar ||
        item.scaled_notes_en ||
        item.progression_rule !== "none"
      )
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    control,
    formState: { errors },
  } = useForm<ItemFormInput>({
    resolver: zodResolver(itemSchema),
    defaultValues: item
      ? {
          exercise_id: item.exercise_id,
          // Entered units (minutes / km / positive assistance) — see
          // set-measures.ts; setToStored converts back on submit.
          sets:
            item.program_item_sets.length > 0
              ? item.program_item_sets.map((s) => setToEntered(item.exercises.measurement_type, item.block, s))
              : [defaultEnteredSet(item.exercises.measurement_type, item.block)],
          progression_rule: item.progression_rule as ProgressionRule,
          notes_ar: item.notes_ar ?? "",
          notes_en: item.notes_en ?? "",
          block: item.block as ItemFormInput["block"],
          rehab_phase_id: item.rehab_phase_id ?? "",
          coach_note_private: item.coach_note_private ?? "",
          tempo: item.tempo ?? "",
          per_side: item.per_side,
          scaled_notes_ar: item.scaled_notes_ar ?? "",
          scaled_notes_en: item.scaled_notes_en ?? "",
        }
      : {
          exercise_id: initialExercise?.id,
          sets: [defaultEnteredSet(initialExercise?.measurement_type, initialBlock ?? "main")],
          progression_rule: "none",
          block: initialBlock ?? "main",
        },
  });
  const { fields, append, remove, replace } = useFieldArray({ control, name: "sets" });
  const block = useWatch({ control, name: "block" });
  const measurementType = selectedExercise?.measurement_type;
  // The inputs this exercise has — from its measurement type, not the block
  // (a plain strength exercise in a rehab/mobility block is still a timed hold).
  const measureFields = measurementFields(measurementType, block);
  const hasReps = measureFields.includes("reps");
  const holdsOnly =
    !hasReps &&
    measureFields.length === 1 &&
    measureFields[0] === "duration" &&
    durationUnit(measurementType, block) === "s";
  const watchedSets = useWatch({ control, name: "sets" });
  const total = (watchedSets ?? []).reduce(
    (sum, s) => sum + (Number(hasReps ? s?.reps : s?.duration_seconds) || 0),
    0
  );
  const meta = selectedExercise ? exerciseMeta(selectedExercise) : null;

  /** A different type/block means different inputs, and a value typed into a
   * field that no longer exists would silently survive into the saved set —
   * so the sets start over from the new type's defaults. */
  function resetSetsIfFieldsChange(nextType: string | null | undefined, nextBlock: string | undefined) {
    const before = measurementFields(measurementType, block).join();
    const after = measurementFields(nextType, nextBlock).join();
    if (before !== after) replace([defaultEnteredSet(nextType, nextBlock)]);
  }

  // One column per measure + set number + rest + remove. Wide types (a
  // treadmill has six measures) get a minimum column width and scroll
  // sideways inside the card rather than crushing the inputs.
  const gridStyle = {
    gridTemplateColumns: `2rem repeat(${measureFields.length + 1}, minmax(${measureFields.length > 3 ? "4.75rem" : "0"}, 1fr)) 2.75rem`,
    minWidth: measureFields.length > 3 ? `${measureFields.length * 5 + 9}rem` : undefined,
  };

  // Which target columns apply: a rep range and RPE/RIR make sense for any
  // rep-based set, %1RM only where there is a (non-assisted) load.
  const targetColumns = [
    ...(hasReps ? (["repsMax"] as const) : []),
    ...(measureFields.includes("weight") && !isAssisted(measurementType) ? (["pct1rm"] as const) : []),
    "rpe",
    "rir",
  ] as ("repsMax" | "pct1rm" | "rpe" | "rir")[];
  const targetGrid = `2rem minmax(7rem, 1.6fr) repeat(${targetColumns.length}, minmax(0, 1fr))`;

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("exercise_id", data.exercise_id);
    formData.set(
      "sets",
      // zodResolver hands handleSubmit the *parsed* values (numbers), though
      // RHF still types them as the schema's input.
      JSON.stringify(
        data.sets.map((set) => setToStored(selectedExercise?.measurement_type, data.block, set as SetPayload))
      )
    );
    formData.set("progression_rule", data.progression_rule ?? "none");
    if (data.notes_ar) formData.set("notes_ar", data.notes_ar);
    if (data.notes_en) formData.set("notes_en", data.notes_en);
    formData.set("block", data.block ?? "main");
    if (data.rehab_phase_id) formData.set("rehab_phase_id", data.rehab_phase_id);
    if (data.coach_note_private) formData.set("coach_note_private", data.coach_note_private);
    formData.set("tempo", data.tempo ?? "");
    formData.set("per_side", data.per_side ? "true" : "false");
    formData.set("scaled_notes_ar", data.scaled_notes_ar ?? "");
    formData.set("scaled_notes_en", data.scaled_notes_en ?? "");

    startTransition(async () => {
      const result = item
        ? await updateItemAction(locale, programId, item.id, formData)
        : await addItemAction(locale, programId, dayId, formData);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      reset();
      setSelectedExercise(null);
      setBrowsing(true);
      onOpenChange(false);
    });
  });

  // Rendered twice (desktop row / inside the mobile notes section), each with
  // its own id so labels stay unique; only one is ever visible.
  const progressionSelect = (id: string) => (
    <Controller
      name="progression_rule"
      control={control}
      render={({ field }) => (
        <Select
          value={field.value}
          onValueChange={field.onChange}
          items={PROGRESSION_RULES.map((rule) => ({ value: rule.value, label: t(rule.labelKey) }))}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROGRESSION_RULES.map((rule) => (
              <SelectItem key={rule.value} value={rule.value}>
                {t(rule.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col gap-0 overflow-hidden p-0 max-md:inset-0 max-md:h-dvh max-md:max-h-none max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none sm:max-w-none md:max-h-[90dvh] md:max-w-[960px]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-5 md:py-4">
          <DialogTitle className="text-lg font-semibold md:text-xl">
            {item ? t("editTitle") : t("addTitle")}
          </DialogTitle>
          <DialogClose
            render={<Button type="button" variant="ghost" size="icon" aria-label={t("close")} title={t("close")} />}
          >
            <X aria-hidden="true" />
          </DialogClose>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              {/* Media column */}
              <div className="flex flex-col gap-3.5 bg-muted/40 md:border-e md:border-border md:p-5">
                {browsing || !selectedExercise ? (
                  <div className="flex flex-col gap-2 p-4 md:p-0">
                    <Label>{t("exercise")}</Label>
                    <ExercisePicker
                      locale={locale}
                      selectedId={selectedExercise?.id ?? null}
                      onSelect={(exercise) => {
                        resetSetsIfFieldsChange(exercise.measurement_type, block);
                        setSelectedExercise(exercise);
                        setBrowsing(false);
                        setValue("exercise_id", exercise.id, { shouldValidate: true });
                      }}
                    />
                    {errors.exercise_id && <p className="text-sm text-destructive">{errors.exercise_id.message}</p>}
                  </div>
                ) : (
                  <>
                    <ExerciseHero
                      key={selectedExercise.id}
                      exercise={selectedExercise}
                      locale={locale}
                      className="aspect-[4/3] max-md:rounded-none max-md:ring-0 md:aspect-square"
                    />
                    <div className="flex items-start justify-between gap-3 px-4 pb-4 md:flex-col md:items-stretch md:p-0">
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <span className="text-lg leading-snug font-semibold">
                          {pickLocale(selectedExercise, locale)}
                        </span>
                        {(meta?.group || meta?.equipment) && (
                          <span className="flex flex-wrap gap-1.5">
                            {meta.group && (
                              <Badge variant="warning" className="rounded-md">
                                {meta.group}
                              </Badge>
                            )}
                            {meta.equipment && (
                              <Badge variant="outline" className="rounded-md">
                                {meta.equipment}
                              </Badge>
                            )}
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 shrink-0 md:w-full"
                        onClick={() => setBrowsing(true)}
                      >
                        {t("changeExercise")}
                      </Button>
                    </div>
                  </>
                )}
              </div>

              {/* Form column */}
              <div className="flex min-w-0 flex-col gap-5 p-4 md:p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="block">{t("block")}</Label>
                    <Controller
                      name="block"
                      control={control}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={(next) => {
                            resetSetsIfFieldsChange(measurementType, next ?? undefined);
                            field.onChange(next);
                          }}
                          items={BLOCKS.map((b) => ({ value: b, label: t(`blockKind.${b}`) }))}
                        >
                          <SelectTrigger id="block" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {BLOCKS.map((b) => (
                              <SelectItem key={b} value={b}>
                                {t(`blockKind.${b}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="flex flex-col gap-2 max-md:hidden">
                    <Label htmlFor="progression_rule">{t("progressionRule")}</Label>
                    {progressionSelect("progression_rule")}
                  </div>
                </div>

                {block === "rehab" && rehabPhases.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="rehab_phase_id">{t("rehabPhase")}</Label>
                    <Controller
                      name="rehab_phase_id"
                      control={control}
                      render={({ field }) => (
                        <Select
                          value={field.value || "none"}
                          onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                          items={[
                            { value: "none", label: t("rehabPhaseNone") },
                            ...rehabPhases.map((p) => ({ value: p.id, label: locale === "ar" ? p.name_ar : p.name_en })),
                          ]}
                        >
                          <SelectTrigger id="rehab_phase_id" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t("rehabPhaseNone")}</SelectItem>
                            {rehabPhases.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {locale === "ar" ? p.name_ar : p.name_en}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">
                    {holdsOnly ? t("holds") : t("sets")}{" "}
                    <span className="font-mono tabular-nums text-muted-foreground">{fields.length}</span>
                  </span>
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <div style={{ minWidth: gridStyle.minWidth }}>
                      <div
                        className={`${SETS_GRID} bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground`}
                        style={{ gridTemplateColumns: gridStyle.gridTemplateColumns }}
                      >
                        <span>{t("setNumber")}</span>
                        {measureFields.map((f) => (
                          <span key={f}>{tm(`fields.${fieldLabelKey(measurementType, f, block)}`)}</span>
                        ))}
                        <span>{t("restS")}</span>
                        <span />
                      </div>
                      {fields.map((field, index) => (
                        <div
                          key={field.id}
                          className={`${SETS_GRID} border-t border-border px-2.5 py-2`}
                          style={{ gridTemplateColumns: gridStyle.gridTemplateColumns }}
                        >
                          <span className="font-mono tabular-nums text-muted-foreground">{index + 1}</span>
                          {measureFields.map((f) => {
                            const rule = inputRule(measurementType, f, block);
                            const required = f === "reps" || f === "duration" || f === "distance" || f === "calories";
                            const label = tm(`fields.${fieldLabelKey(measurementType, f, block)}`);
                            return (
                              <Input
                                key={f}
                                type="number"
                                inputMode={rule.integer ? "numeric" : "decimal"}
                                min={rule.min}
                                max={rule.max}
                                step={rule.step}
                                placeholder={required ? undefined : "—"}
                                aria-label={`${label} · ${t("setN", { index: index + 1 })}`}
                                className={SET_INPUT}
                                {...register(setFieldPath(index, f))}
                              />
                            );
                          })}
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={900}
                            placeholder="—"
                            aria-label={t("restAria", { n: index + 1 })}
                            className={SET_INPUT}
                            {...register(`sets.${index}.rest_seconds` as const)}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive max-md:size-11"
                            aria-label={t("removeSetAria", { n: index + 1 })}
                            title={t("removeSetAria", { n: index + 1 })}
                            onClick={() => remove(index)}
                            disabled={fields.length <= 1}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 border-dashed"
                    onClick={() => {
                      // Duplicate the last set (every measure, weight, rest).
                      const last = getValues(`sets.${fields.length - 1}` as const);
                      append(last ? { ...last } : defaultEnteredSet(measurementType, block));
                    }}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    {t("duplicateSet")}
                  </Button>
                </div>

                <details open={targetsOpen} className="group rounded-xl bg-muted/40">
                  <summary className="flex h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                    <span>
                      {t("targets.title")} <span className="font-normal text-muted-foreground">{t("optional")}</span>
                    </span>
                    <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="flex flex-col gap-2 px-3 pb-3">
                    <p className="text-xs text-muted-foreground">{t("targets.hint")}</p>
                    <div className="overflow-x-auto rounded-xl border border-border bg-background">
                      <div style={{ minWidth: `${12 + targetColumns.length * 5}rem` }}>
                        <div
                          className={`${SETS_GRID} bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground`}
                          style={{ gridTemplateColumns: targetGrid }}
                        >
                          <span>{t("setNumber")}</span>
                          <span>{t("targets.setType")}</span>
                          {targetColumns.map((c) => (
                            <span key={c}>{t(`targets.${c}`)}</span>
                          ))}
                        </div>
                        {fields.map((field, index) => (
                          <div
                            key={field.id}
                            className={`${SETS_GRID} border-t border-border px-2.5 py-2`}
                            style={{ gridTemplateColumns: targetGrid }}
                          >
                            <span className="font-mono tabular-nums text-muted-foreground">{index + 1}</span>
                            <Controller
                              name={`sets.${index}.set_type` as const}
                              control={control}
                              render={({ field: f }) => (
                                <Select
                                  value={f.value ?? "working"}
                                  onValueChange={f.onChange}
                                  items={SET_TYPES.map((s) => ({ value: s, label: tm(`setTypes.${s}`) }))}
                                >
                                  <SelectTrigger
                                    className="w-full md:h-9"
                                    aria-label={`${t("targets.setType")} · ${t("setN", { index: index + 1 })}`}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {SET_TYPES.map((s) => (
                                      <SelectItem key={s} value={s}>
                                        {tm(`setTypes.${s}`)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                            {targetColumns.map((c) => (
                              <Input
                                key={c}
                                type="number"
                                inputMode={c === "pct1rm" || c === "rpe" ? "decimal" : "numeric"}
                                min={c === "rir" ? 0 : 1}
                                max={c === "pct1rm" ? 200 : c === "repsMax" ? 500 : 10}
                                step={c === "rpe" ? 0.5 : 1}
                                placeholder="—"
                                aria-label={`${t(`targets.${c}`)} · ${t("setN", { index: index + 1 })}`}
                                className={SET_INPUT}
                                {...register(`sets.${index}.${TARGET_FIELD[c]}` as `sets.${number}.reps`)}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </details>

                <details open={notesOpen} className="group rounded-xl bg-muted/40">
                  <summary className="flex h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                    <span className="max-md:hidden">
                      {t("notes")} <span className="font-normal text-muted-foreground">{t("optional")}</span>
                    </span>
                    <span className="md:hidden">{t("progressionAndNotes")}</span>
                    <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="flex flex-col gap-3 px-3 pb-3">
                    <div className="flex flex-col gap-2 md:hidden">
                      <Label htmlFor="progression_rule_mobile">{t("progressionRule")}</Label>
                      {progressionSelect("progression_rule_mobile")}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="tempo">{t("tempo")}</Label>
                        <Input id="tempo" dir="ltr" maxLength={12} placeholder="3-1-1-0" {...register("tempo")} />
                      </div>
                      <label className="flex items-center gap-2 self-end pb-2 text-sm">
                        <input type="checkbox" className="size-4 accent-primary" {...register("per_side")} />
                        {t("perSide")}
                      </label>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="scaled_notes_ar">{t("scaledAr")}</Label>
                      <Textarea id="scaled_notes_ar" dir="rtl" rows={2} {...register("scaled_notes_ar")} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="scaled_notes_en">{t("scaledEn")}</Label>
                      <Textarea id="scaled_notes_en" dir="ltr" rows={2} {...register("scaled_notes_en")} />
                      <p className="text-xs text-muted-foreground">{t("scaledHint")}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="notes_ar">{t("notesAr")}</Label>
                      <Textarea id="notes_ar" dir="rtl" rows={2} {...register("notes_ar")} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="notes_en">{t("notesEn")}</Label>
                      <Textarea id="notes_en" dir="ltr" rows={2} {...register("notes_en")} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="coach_note_private">{t("coachNotePrivate")}</Label>
                      <Textarea id="coach_note_private" rows={2} {...register("coach_note_private")} />
                      <p className="text-xs text-muted-foreground">{t("coachNotePrivateHint")}</p>
                    </div>
                  </div>
                </details>

                {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/50 px-4 py-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-5 md:py-3.5">
            <span className="text-sm text-muted-foreground max-md:hidden">
              {t.rich(hasReps ? "summaryReps" : holdsOnly ? "summaryHolds" : "summarySets", {
                sets: fields.length,
                total,
                m: mono,
              })}
            </span>
            <div className="flex gap-2 max-md:w-full">
              <Button
                type="button"
                variant="outline"
                className="h-11 px-4 max-md:hidden"
                onClick={() => onOpenChange(false)}
              >
                {tCommon("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={pending || !selectedExercise}
                className="h-12 min-w-24 px-5 max-md:w-full md:h-11"
              >
                {pending ? (
                  tCommon("pending")
                ) : item ? (
                  t("submit")
                ) : (
                  <>
                    <span className="max-md:hidden">{t("addToProgram")}</span>
                    <span className="md:hidden">{t.rich("addToProgramCount", { count: fields.length, m: mono })}</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
