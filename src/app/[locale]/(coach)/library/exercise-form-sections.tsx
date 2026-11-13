"use client";

import { useEffect, useRef, useState } from "react";
import { Controller, useController, useWatch, type UseFormReturn } from "react-hook-form";
import { useTranslations } from "next-intl";
import { ImageIcon, ImageOff, Link2, Play, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MUSCLE_GROUPS } from "@/domain/library/taxonomy";
import { MEASUREMENT_TYPES, fieldLabelKey, measurementFields } from "@/domain/library/measurement";
import {
  joinTempo,
  sanitizeTempoBox,
  splitTempo,
  type ContentLang,
  type ExerciseFormValues,
} from "@/domain/library/exercise-form";
import { SKILL_GROUPS } from "@/domain/progress/skill-levels";
import { resolveExerciseMedia } from "@/lib/video-embed";
import { cn } from "@/lib/utils";
import { TagsInput } from "./recipes/tags-input";

export type ExerciseForm = UseFormReturn<ExerciseFormValues>;
export type SectionProps = { form: ExerciseForm; lang: ContentLang; idp: string };

// Inputs are 44px on every breakpoint (touch target); the shared Input is
// 40px on mobile and 32px from md up.
const INPUT = "h-11 md:h-11";
const HINT = "text-[13px] leading-snug text-muted-foreground";
const dirOf = (lang: ContentLang) => (lang === "ar" ? "rtl" : "ltr");
const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
// Selected fill per level: green / orange / red.
const DIFFICULTY_ON: Record<(typeof DIFFICULTIES)[number], string> = {
  beginner: "bg-success text-success-foreground",
  intermediate: "bg-primary text-primary-foreground",
  advanced: "bg-destructive text-destructive-foreground",
};
const NO_SKILL = "__none__";

function FieldError({ error, id }: { error: unknown; id?: string }) {
  const t = useTranslations("library.exercise.form.errors");
  const message = (error as { message?: string } | undefined)?.message;
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {t.has(message) ? t(message) : t("invalid")}
    </p>
  );
}

function Required() {
  const t = useTranslations("library.exercise.form");
  return (
    <>
      <span aria-hidden="true" className="text-destructive">*</span>
      <span className="sr-only">{t("tagRequired")}</span>
    </>
  );
}

// ---------------------------------------------------------------------------
// 1 · Basics
// ---------------------------------------------------------------------------

export function BasicsSection({ form, lang, idp }: SectionProps) {
  const t = useTranslations("library.exercise");
  const tf = useTranslations("library.exercise.form");
  const tGroups = useTranslations("library.muscleGroups");
  const tTypes = useTranslations("measure.types");
  const tFields = useTranslations("measure.fields");
  const tSkills = useTranslations("progress.skills.groups");
  const { register, control, formState: { errors } } = form;
  const id = (n: string) => `${idp}${n}`;

  const nameKey = `name_${lang}` as const;
  const other: ContentLang = lang === "ar" ? "en" : "ar";
  const otherName = useWatch({ control, name: `name_${other}` });
  const otherLangLabel = tf(other === "ar" ? "langAr" : "langEn");

  const subtitle = (type: (typeof MEASUREMENT_TYPES)[number]) =>
    measurementFields(type).map((f) => tFields(fieldLabelKey(type, f))).join(" · ");

  return (
    <div className="flex flex-col gap-5">
      <div key={lang} className="flex flex-col gap-1.5">
        <Label htmlFor={id(nameKey)}>
          {t(lang === "ar" ? "nameAr" : "nameEn")} <Required />
        </Label>
        <Input
          id={id(nameKey)}
          dir={dirOf(lang)}
          className={INPUT}
          aria-invalid={!!errors[nameKey] || undefined}
          aria-describedby={errors[nameKey] ? id(`${nameKey}_error`) : undefined}
          {...register(nameKey)}
        />
        <FieldError error={errors[nameKey]} id={id(`${nameKey}_error`)} />
        <p className={HINT}>
          {otherName?.trim()
            ? tf.rich("otherLangValue", {
                lang: otherLangLabel,
                value: otherName,
                v: (chunks) => <bdi dir={dirOf(other)}>{chunks}</bdi>,
              })
            : tf("otherLangEmpty", { lang: otherLangLabel })}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span id={id("muscle_group_label")} className="flex items-center gap-1 text-sm font-medium">
          {t("muscleGroup")} <Required />
        </span>
        <Controller
          name="muscle_group"
          control={control}
          render={({ field, fieldState }) => (
            <>
              <div role="group" aria-labelledby={id("muscle_group_label")} className="flex flex-wrap gap-1.5">
                {MUSCLE_GROUPS.map((group, i) => (
                  <button
                    key={group}
                    id={i === 0 ? id("muscle_group") : undefined}
                    type="button"
                    aria-pressed={field.value === group}
                    onClick={() => field.onChange(group)}
                    className={cn(
                      "h-11 rounded-full px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                      field.value === group
                        ? "bg-foreground text-background"
                        : "bg-card text-foreground ring-1 ring-border hover:bg-muted"
                    )}
                  >
                    {tGroups(group)}
                  </button>
                ))}
              </div>
              <FieldError error={fieldState.error} />
            </>
          )}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="flex flex-col leading-snug">
          <span id={id("measurement_label")} className="text-sm font-medium">{t("measurementType")}</span>
          <span className={HINT}>{t("measurementTypeHint")}</span>
        </span>
        <Controller
          name="measurement_type"
          control={control}
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              onValueChange={field.onChange}
              aria-labelledby={id("measurement_label")}
              className="grid-cols-1 md:grid-cols-2"
            >
              {MEASUREMENT_TYPES.map((type) => (
                <label
                  key={type}
                  className="flex min-h-15 cursor-pointer items-center gap-3 rounded-xl bg-card px-3 py-2 ring-1 ring-border has-[[data-checked]]:ring-2 has-[[data-checked]]:ring-primary"
                >
                  <RadioGroupItem value={type} />
                  <span className="flex min-w-0 flex-col leading-snug">
                    <span className="font-semibold">{tTypes(type)}</span>
                    <span className={HINT}>{subtitle(type)}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          )}
        />
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <span id={id("difficulty_label")} className="text-sm font-medium">{t("difficulty")}</span>
          <Controller
            name="difficulty"
            control={control}
            render={({ field }) => (
              <div
                role="group"
                aria-labelledby={id("difficulty_label")}
                className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-0.5"
              >
                {DIFFICULTIES.map((d) => {
                  const on = field.value === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      // Tapping the active level clears it — difficulty is optional.
                      onClick={() => field.onChange(on ? undefined : d)}
                      className={cn(
                        "h-11 min-w-0 truncate rounded-md px-2 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                        on ? DIFFICULTY_ON[d] : "text-foreground hover:bg-background/60"
                      )}
                    >
                      {t(`difficultyLevel.${d}`)}
                    </button>
                  );
                })}
              </div>
            )}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("equipment")}>{t("equipment")}</Label>
          <Input
            id={id("equipment")}
            className={INPUT}
            placeholder={tf("equipmentPlaceholder")}
            aria-invalid={!!errors.equipment || undefined}
            {...register("equipment")}
          />
          <FieldError error={errors.equipment} />
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={id("skill_group")}>{tf("skillLadder")}</Label>
          <Badge variant="secondary" className="rounded-md">{tf("tagOptional")}</Badge>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
          <Controller
            name="skill_group"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value || NO_SKILL}
                onValueChange={(v) => field.onChange(v === NO_SKILL ? "" : v)}
                items={[
                  { value: NO_SKILL, label: t("skillNone") },
                  ...SKILL_GROUPS.map((g) => ({ value: g, label: tSkills(g) })),
                ]}
              >
                <SelectTrigger id={id("skill_group")} className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SKILL}>{t("skillNone")}</SelectItem>
                  {SKILL_GROUPS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {tSkills(g)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <Input
            id={id("skill_level")}
            type="number"
            inputMode="numeric"
            min={1}
            max={10}
            placeholder={t("skillLevel")}
            aria-label={t("skillLevel")}
            aria-invalid={!!errors.skill_level || undefined}
            className={cn(INPUT, "font-mono")}
            {...register("skill_level", { setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)) })}
          />
        </div>
        <FieldError error={errors.skill_level} />
        <p className={HINT}>{t("skillHint")}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2 · Media
// ---------------------------------------------------------------------------

function Thumb({ url }: { url: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const media = resolveExerciseMedia(url);
  const box = "flex size-18 shrink-0 items-center justify-center overflow-hidden rounded-xl";

  if (media?.kind === "image") {
    if (failed === media.src) {
      return (
        <span className={cn(box, "bg-muted text-muted-foreground")} aria-hidden="true">
          <ImageOff className="size-5" />
        </span>
      );
    }
    return (
      <span className={cn(box, "bg-muted")} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- coach-supplied remote URL, same as the library card */}
        <img src={media.src} alt="" onError={() => setFailed(media.src)} className="size-full object-cover" />
      </span>
    );
  }
  if (media) {
    return (
      <span className={cn(box, "bg-success-tint text-success-tint-foreground")} aria-hidden="true">
        {media.kind === "embed" ? <Play className="size-5 fill-current" /> : <Link2 className="size-5" />}
      </span>
    );
  }
  return (
    <span className={cn(box, "bg-muted text-muted-foreground")} aria-hidden="true">
      <ImageIcon className="size-5" />
    </span>
  );
}

type MediaName = "video_url" | "image_url" | "thumbnail_url" | "video_url_alt";

function MediaField({
  form,
  idp,
  name,
  label,
  hint,
  placeholder,
}: {
  form: ExerciseForm;
  idp: string;
  name: MediaName;
  label: string;
  hint: string;
  placeholder: string;
}) {
  const url = useWatch({ control: form.control, name }) ?? "";
  const error = form.formState.errors[name];
  return (
    <div className="flex items-start gap-3">
      <Thumb url={url} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Label htmlFor={`${idp}${name}`}>{label}</Label>
        <Input
          id={`${idp}${name}`}
          type="url"
          dir="ltr"
          inputMode="url"
          placeholder={placeholder}
          className={INPUT}
          aria-invalid={!!error || undefined}
          {...form.register(name)}
        />
        <FieldError error={error} />
        <p className={HINT}>{hint}</p>
      </div>
    </div>
  );
}

export function MediaSection({ form, idp }: SectionProps) {
  const t = useTranslations("library.exercise");
  const tf = useTranslations("library.exercise.form");
  return (
    <div className="flex flex-col gap-5">
      <MediaField form={form} idp={idp} name="video_url" label={t("videoUrl")} hint={tf("mediaHintVideo")} placeholder="https://youtube.com/watch?v=…" />
      <MediaField form={form} idp={idp} name="image_url" label={t("imageUrl")} hint={tf("mediaHintImage")} placeholder="https://…/demo.gif" />
      <MediaField form={form} idp={idp} name="thumbnail_url" label={t("thumbnailUrl")} hint={tf("mediaHintThumb")} placeholder="https://…/thumb.jpg" />
      <MediaField form={form} idp={idp} name="video_url_alt" label={t("videoUrlAlt")} hint={tf("mediaHintAlt")} placeholder="https://youtube.com/watch?v=…" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3 · Instructions
// ---------------------------------------------------------------------------

type ListName = "cues_ar" | "cues_en" | "steps_ar" | "steps_en" | "mistakes_ar" | "mistakes_en";

/** One input per row (number, text, delete) over a string[] field, with a
 * dashed add button. Enter in a row adds the next one instead of submitting
 * the whole dialog. Blank rows are dropped when the form is saved. */
function RowList({
  form,
  name,
  firstId,
  label,
  hint,
  addLabel,
  dir,
}: {
  form: ExerciseForm;
  name: ListName;
  firstId: string;
  label: string;
  hint?: string;
  addLabel: string;
  dir: "rtl" | "ltr";
}) {
  const t = useTranslations("library.exercise.form");
  const { field, fieldState } = useController({ control: form.control, name });
  const rows: string[] = field.value ?? [];
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focusNext = useRef<number | null>(null);

  // Runs after every render; only acts right after an add.
  useEffect(() => {
    if (focusNext.current != null) {
      refs.current[focusNext.current]?.focus();
      focusNext.current = null;
    }
  });

  const insertAt = (at: number) => {
    focusNext.current = at;
    field.onChange([...rows.slice(0, at), "", ...rows.slice(at)]);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="flex flex-col leading-snug">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className={HINT}>{hint}</span>}
      </span>
      {rows.length === 0 ? (
        <p className={HINT}>{t("emptyList")}</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {rows.map((row, i) => (
            <li key={i} className="grid grid-cols-[1.5rem_minmax(0,1fr)_2.75rem] items-center gap-1.5">
              <span className="text-center font-mono text-sm text-muted-foreground tabular-nums">{i + 1}</span>
              <Input
                id={i === 0 ? firstId : undefined}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                value={row}
                dir={dir}
                maxLength={300}
                className={INPUT}
                aria-label={t("rowN", { label, n: i + 1 })}
                onChange={(e) => field.onChange(rows.map((r, k) => (k === i ? e.target.value : r)))}
                onBlur={field.onBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    insertAt(i + 1);
                  }
                }}
              />
              <Button
                type="button"
                variant="ghost"
                aria-label={t("removeRow", { n: i + 1 })}
                onClick={() => field.onChange(rows.filter((_, k) => k !== i))}
                className="size-11 text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <FieldError error={fieldState.error} />
      <Button type="button" variant="outline" onClick={() => insertAt(rows.length)} className="h-11 w-full border-dashed">
        <Plus className="size-4" aria-hidden="true" />
        {addLabel}
      </Button>
    </div>
  );
}

export function InstructionsSection({ form, lang, idp }: SectionProps) {
  const t = useTranslations("library.exercise");
  const tf = useTranslations("library.exercise.form");
  const dir = dirOf(lang);
  const sfx = lang === "ar" ? "Ar" : "En";
  const { register } = form;
  const id = (n: string) => `${idp}${n}`;

  return (
    // key remounts the uncontrolled inputs/rows with the other language's value.
    <div key={lang} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id(`instructions_${lang}`)}>{t(`instructions${sfx}`)}</Label>
        <Textarea
          id={id(`instructions_${lang}`)}
          dir={dir}
          rows={3}
          placeholder={tf("instructionsPlaceholder")}
          className="min-h-21"
          {...register(`instructions_${lang}`)}
        />
      </div>
      <RowList
        form={form}
        name={`cues_${lang}`}
        firstId={id(`cues_${lang}`)}
        label={t(`cues${sfx}`)}
        hint={t("cuesHint")}
        addLabel={tf("addCue")}
        dir={dir}
      />
      <RowList
        form={form}
        name={`steps_${lang}`}
        firstId={id(`steps_${lang}`)}
        label={t(`steps${sfx}`)}
        hint={tf("stepsHint")}
        addLabel={tf("addStep")}
        dir={dir}
      />
      <RowList
        form={form}
        name={`mistakes_${lang}`}
        firstId={id(`mistakes_${lang}`)}
        label={t(`mistakes${sfx}`)}
        hint={tf("mistakesHint")}
        addLabel={tf("addMistake")}
        dir={dir}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id(`safety_${lang}`)}>{t(`safety${sfx}`)}</Label>
        <Textarea id={id(`safety_${lang}`)} dir={dir} rows={2} className="min-h-21" {...register(`safety_${lang}`)} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4 · Extra details
// ---------------------------------------------------------------------------

/** Four small boxes over the single "3-1-1-0" tempo string. The boxes keep
 * their own state: deriving them from the joined string would turn a
 * just-cleared box straight back into "0" while the coach is retyping it. */
function TempoInput({ form, idp }: { form: ExerciseForm; idp: string }) {
  const t = useTranslations("library.exercise");
  const tf = useTranslations("library.exercise.form");
  const { field } = useController({ control: form.control, name: "tempo" });
  const [boxes, setBoxes] = useState<string[]>(() => splitTempo(field.value));
  const labels = [tf("tempoLower"), tf("tempoPauseBottom"), tf("tempoLift"), tf("tempoPauseTop")];

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${idp}tempo_label`} className="text-sm font-medium">{t("tempo")}</span>
      <div role="group" aria-labelledby={`${idp}tempo_label`} dir="ltr" className="grid max-w-sm grid-cols-4 gap-2">
        {boxes.map((value, i) => (
          <label key={i} className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
            <Input
              id={i === 0 ? `${idp}tempo` : undefined}
              value={value}
              inputMode="numeric"
              maxLength={2}
              aria-label={tf("rowN", { label: labels[i], n: i + 1 })}
              className={cn(INPUT, "text-center font-mono font-semibold")}
              onChange={(e) => {
                const next = boxes.map((b, k) => (k === i ? sanitizeTempoBox(e.target.value) : b));
                setBoxes(next);
                field.onChange(joinTempo(next));
              }}
              onBlur={field.onBlur}
            />
            <span aria-hidden="true">{labels[i]}</span>
          </label>
        ))}
      </div>
      <p className={HINT}>{tf("tempoHint")}</p>
    </div>
  );
}

function MuscleTags({
  form,
  idp,
  name,
  label,
  tone,
}: {
  form: ExerciseForm;
  idp: string;
  name: "primary_muscles" | "secondary_muscles";
  label: string;
  tone: "info" | "secondary";
}) {
  const tf = useTranslations("library.exercise.form");
  const { field, fieldState } = useController({ control: form.control, name });
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${idp}${name}`}>{label}</Label>
      <TagsInput
        id={`${idp}${name}`}
        value={field.value ?? []}
        onChange={field.onChange}
        invalid={!!fieldState.error}
        max={12}
        maxLength={30}
        placeholder={tf("tagsPlaceholder")}
        tone={tone}
      />
      <FieldError error={fieldState.error} />
    </div>
  );
}

export function ExtraSection({ form, lang, idp }: SectionProps) {
  const t = useTranslations("library.exercise");
  const sfx = lang === "ar" ? "Ar" : "En";
  return (
    <div className="flex flex-col gap-5">
      <TempoInput form={form} idp={idp} />
      <MuscleTags form={form} idp={idp} name="primary_muscles" label={t("primaryMuscles")} tone="info" />
      <MuscleTags form={form} idp={idp} name="secondary_muscles" label={t("secondaryMuscles")} tone="secondary" />
      <div key={lang} className="flex flex-col gap-1.5">
        <Label htmlFor={`${idp}coach_notes_${lang}`}>{t(`coachNotes${sfx}`)}</Label>
        <Textarea
          id={`${idp}coach_notes_${lang}`}
          dir={dirOf(lang)}
          rows={3}
          className="min-h-21"
          {...form.register(`coach_notes_${lang}`)}
        />
      </div>
    </div>
  );
}
