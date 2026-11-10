"use client";

import { useRef, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { useLocale, useTranslations } from "next-intl";
import { Camera, Check, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatNumber, toLatinDigits } from "@/lib/format";
import { pickBilingual, pickLocale, type AppLocale } from "@/domain/locale";
import type { FormField } from "@/domain/forms/schema";
import type { LibraryRefOption } from "@/domain/forms/library-refs";
import { PhotoFileInput, useMediaUpload } from "./photo-file-input";

type UploadContext = { coachId: string; clientId: string };

/** The client fill form's inputs: big touch targets and 16px text for the
 * one-question-per-screen mobile flow, `compact` for the all-on-one-page
 * desktop card. Same answer contract as FieldInput (which the coach preview
 * still uses): number|undefined, string, string[], boolean, storage path. */
export function FillFieldInput({
  field,
  labelId,
  compact = false,
  previousValue,
  refOptions,
  uploadContext,
}: {
  field: FormField;
  /** id of the element that names this question (the title / label). */
  labelId: string;
  compact?: boolean;
  previousValue?: unknown;
  refOptions?: LibraryRefOption[];
  uploadContext?: UploadContext;
}) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("forms.fill");
  const { control } = useFormContext();
  const textSize = "text-base md:text-base";

  switch (field.type) {
    case "text":
      return (
        <Controller
          name={field.id}
          control={control}
          render={({ field: f }) => (
            <Input
              id={field.id}
              aria-labelledby={labelId}
              value={f.value ?? ""}
              onChange={(e) => f.onChange(e.target.value)}
              onBlur={f.onBlur}
              className={cn("h-12 rounded-xl px-3.5 md:h-12", textSize)}
            />
          )}
        />
      );

    case "textarea":
      return (
        <Controller
          name={field.id}
          control={control}
          render={({ field: f }) => (
            <Textarea
              id={field.id}
              aria-labelledby={labelId}
              placeholder={t("textPlaceholder")}
              value={f.value ?? ""}
              onChange={(e) => f.onChange(e.target.value)}
              onBlur={f.onBlur}
              className={cn("resize-none rounded-xl px-3.5 py-3", compact ? "min-h-24" : "min-h-40", textSize)}
            />
          )}
        />
      );

    case "number":
      return (
        <Controller
          name={field.id}
          control={control}
          render={({ field: f }) => (
            <NumberInput
              // A fresh draft string per question, never carried between fields.
              key={field.id}
              field={field}
              labelId={labelId}
              compact={compact}
              value={typeof f.value === "number" ? f.value : undefined}
              onChange={f.onChange}
              previous={typeof previousValue === "number" ? previousValue : undefined}
            />
          )}
        />
      );

    case "date":
      return (
        <Controller
          name={field.id}
          control={control}
          render={({ field: f }) => (
            <Input
              id={field.id}
              type="date"
              aria-labelledby={labelId}
              value={f.value ?? ""}
              onChange={(e) => f.onChange(e.target.value || undefined)}
              onBlur={f.onBlur}
              className={cn("h-12 rounded-xl px-3.5 md:h-12", textSize)}
            />
          )}
        />
      );

    case "checkbox":
      return (
        <Controller
          name={field.id}
          control={control}
          render={({ field: f }) => (
            <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 text-base font-medium">
              <span id={`${field.id}-state`}>{f.value ? t("yes") : t("no")}</span>
              <Switch
                id={field.id}
                aria-labelledby={`${labelId} ${field.id}-state`}
                checked={!!f.value}
                onCheckedChange={(checked) => f.onChange(checked)}
                className="data-[size=default]:h-7 data-[size=default]:w-12 [&>span]:group-data-[size=default]/switch:size-6"
              />
            </label>
          )}
        />
      );

    case "scale": {
      const min = field.min ?? 1;
      const max = field.max ?? 5;
      const choices = Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => {
        const n = min + i;
        return { value: String(n), label: formatNumber(n, locale) };
      });
      return (
        <Controller
          name={field.id}
          control={control}
          render={({ field: f }) => (
            <div className="flex flex-col gap-2">
              <RadioChoices
                choices={choices}
                value={f.value === undefined || f.value === null ? undefined : String(f.value)}
                onChange={(v) => f.onChange(Number(v))}
                labelId={labelId}
                variant="scale"
                compact={compact}
              />
              {(field.minLabel || field.maxLabel) && (
                <div className="flex justify-between gap-3 text-sm text-muted-foreground">
                  <span>{field.minLabel && pickBilingual(field.minLabel, locale)}</span>
                  <span className="text-end">{field.maxLabel && pickBilingual(field.maxLabel, locale)}</span>
                </div>
              )}
            </div>
          )}
        />
      );
    }

    case "radio":
      return (
        <Controller
          name={field.id}
          control={control}
          render={({ field: f }) => (
            <RadioChoices
              choices={(field.options ?? []).map((o) => ({ value: o.value, label: pickBilingual(o.label, locale) }))}
              value={f.value}
              onChange={f.onChange}
              labelId={labelId}
              variant={compact ? "inline" : "list"}
              compact={compact}
            />
          )}
        />
      );

    case "multiselect":
      return (
        <Controller
          name={field.id}
          control={control}
          render={({ field: f }) => {
            const current: string[] = Array.isArray(f.value) ? f.value : [];
            return (
              <div
                role="group"
                aria-labelledby={labelId}
                className={compact ? "flex flex-wrap gap-2" : "flex flex-col gap-2.5"}
              >
                {(field.options ?? []).map((o) => {
                  const on = current.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => f.onChange(on ? current.filter((v) => v !== o.value) : [...current, o.value])}
                      className={choiceClass(compact ? "inline" : "list", on)}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex size-5.5 shrink-0 items-center justify-center rounded-md border-2",
                          on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/60"
                        )}
                      >
                        {on && <Check className="size-3.5" />}
                      </span>
                      {pickBilingual(o.label, locale)}
                    </button>
                  );
                })}
              </div>
            );
          }}
        />
      );

    case "select":
      return (
        <NativeSelect
          field={field}
          labelId={labelId}
          options={(field.options ?? []).map((o) => ({ value: o.value, label: pickBilingual(o.label, locale) }))}
        />
      );

    case "exercise_ref":
    case "food_ref":
      return (
        <NativeSelect
          field={field}
          labelId={labelId}
          options={(refOptions ?? []).map((o) => ({ value: o.id, label: pickLocale(o, locale) }))}
        />
      );

    case "photo":
      return compact ? (
        <PhotoFileField field={field} accept="image/*" uploadContext={uploadContext} />
      ) : (
        <PhotoCaptureStep field={field} uploadContext={uploadContext} />
      );

    case "file":
      return <PhotoFileField field={field} uploadContext={uploadContext} />;

    case "section":
      return null;
  }
}

// --- choices ---------------------------------------------------------------

type Variant = "list" | "inline" | "scale";

function choiceClass(variant: Variant, on: boolean) {
  return cn(
    "flex items-center gap-3 border text-start font-medium transition-colors",
    variant === "list" && "min-h-14 w-full rounded-2xl px-4 text-base",
    variant === "inline" && "min-h-12 rounded-xl px-4 text-base",
    variant === "scale" && "min-h-13 min-w-12 flex-1 justify-center rounded-xl font-mono text-xl font-semibold",
    on
      ? variant === "scale"
        ? "border-primary bg-primary text-primary-foreground"
        : "border-primary bg-primary/10 ring-1 ring-primary"
      : "border-border bg-card hover:bg-muted/60"
  );
}

/** WAI-ARIA radio group: one tab stop (the selected, else the first), arrow
 * keys move and select, direction-aware for RTL. */
function RadioChoices({
  choices,
  value,
  onChange,
  labelId,
  variant,
  compact,
}: {
  choices: { value: string; label: string }[];
  value: string | undefined;
  onChange: (value: string) => void;
  labelId: string;
  variant: Variant;
  compact: boolean;
}) {
  const rtl = useLocale() === "ar";
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = choices.findIndex((c) => c.value === value);
  const tabbable = selected >= 0 ? selected : 0;

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const forward = e.key === "ArrowDown" || e.key === (rtl ? "ArrowLeft" : "ArrowRight");
    const backward = e.key === "ArrowUp" || e.key === (rtl ? "ArrowRight" : "ArrowLeft");
    if (!forward && !backward) return;
    e.preventDefault();
    const next = (index + (forward ? 1 : -1) + choices.length) % choices.length;
    refs.current[next]?.focus();
    onChange(choices[next].value);
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className={cn(
        variant === "list" && "flex flex-col gap-2.5",
        variant === "inline" && "flex flex-wrap gap-2",
        variant === "scale" && "flex flex-wrap gap-2",
        variant === "scale" && !compact && "[&>button]:min-h-16"
      )}
    >
      {choices.map((c, i) => {
        const on = c.value === value;
        return (
          <button
            key={c.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === tabbable ? 0 : -1}
            onClick={() => onChange(c.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={choiceClass(variant, on)}
          >
            {variant !== "scale" && (
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-5.5 shrink-0 items-center justify-center rounded-full border-2",
                  on ? "border-primary" : "border-muted-foreground/60"
                )}
              >
                {on && <span className="size-2.5 rounded-full bg-primary" />}
              </span>
            )}
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

// --- native select ---------------------------------------------------------

function NativeSelect({
  field,
  labelId,
  options,
}: {
  field: FormField;
  labelId: string;
  options: { value: string; label: string }[];
}) {
  const t = useTranslations("forms.fill");
  const { control } = useFormContext();
  return (
    <Controller
      name={field.id}
      control={control}
      render={({ field: f }) => (
        <select
          id={field.id}
          aria-labelledby={labelId}
          value={f.value ?? ""}
          onChange={(e) => f.onChange(e.target.value || undefined)}
          onBlur={f.onBlur}
          className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="">{t("selectPlaceholder")}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    />
  );
}

// --- number ----------------------------------------------------------------

function roundTo(n: number, decimals: number) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function NumberInput({
  field,
  labelId,
  compact,
  value,
  onChange,
  previous,
}: {
  field: FormField;
  labelId: string;
  compact: boolean;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  previous: number | undefined;
}) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("forms.fill");
  const step = field.step ?? 1;
  const decimals = (String(step).split(".")[1] ?? "").length;
  // The input keeps its own text so "7." and "-" survive mid-typing; only a
  // complete number is pushed to the form.
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));

  function type(text: string) {
    setDraft(text);
    const normalized = toLatinDigits(text).replace(/[,٫]/g, ".").trim();
    if (normalized === "") return onChange(undefined);
    const n = Number(normalized);
    if (!Number.isNaN(n)) onChange(n);
  }

  function bump(direction: 1 | -1) {
    const base = value ?? previous ?? field.min ?? 0;
    let next = roundTo(base + direction * step, decimals);
    if (field.min !== undefined) next = Math.max(field.min, next);
    if (field.max !== undefined) next = Math.min(field.max, next);
    setDraft(String(next));
    onChange(next);
  }

  const atMin = value !== undefined && field.min !== undefined && value <= field.min;
  const atMax = value !== undefined && field.max !== undefined && value >= field.max;
  const hint =
    previous !== undefined ? t("lastTime", { value: `${formatNumber(previous, locale)}${field.unit ? ` ${field.unit}` : ""}` }) : null;

  const input = (
    <input
      id={field.id}
      aria-labelledby={labelId}
      inputMode="decimal"
      dir="ltr"
      value={draft}
      onChange={(e) => type(e.target.value)}
      placeholder="0"
      className={cn(
        "min-w-0 bg-transparent font-mono font-semibold tabular-nums outline-none placeholder:text-muted-foreground/50",
        compact ? "w-full text-lg" : "w-full text-center text-5xl"
      )}
    />
  );

  if (compact) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="flex h-12 items-center gap-2 rounded-xl border border-input px-3.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          {input}
          {field.unit && <span className="shrink-0 text-muted-foreground">{field.unit}</span>}
        </span>
        {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full items-center justify-center gap-3.5 py-3">
        <StepButton label={t("decrease")} onClick={() => bump(-1)} disabled={atMin}>
          <Minus className="size-6" />
        </StepButton>
        <div className="flex min-w-0 flex-1 flex-col items-center leading-tight">
          {input}
          {field.unit && <span className="text-muted-foreground">{field.unit}</span>}
        </div>
        <StepButton label={t("increase")} onClick={() => bump(1)} disabled={atMax}>
          <Plus className="size-6" />
        </StepButton>
      </div>
      {hint && <span className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground">{hint}</span>}
    </div>
  );
}

function StepButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground transition-colors hover:bg-muted/70 disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

// --- photo / file ----------------------------------------------------------

function PhotoFileField({
  field,
  accept,
  uploadContext,
}: {
  field: FormField;
  accept?: string;
  uploadContext?: UploadContext;
}) {
  const { control } = useFormContext();
  return (
    <Controller
      name={field.id}
      control={control}
      render={({ field: f }) => (
        <PhotoFileInput value={f.value} onChange={f.onChange} accept={accept} uploadContext={uploadContext} />
      )}
    />
  );
}

function PhotoCaptureStep({ field, uploadContext }: { field: FormField; uploadContext?: UploadContext }) {
  const { control } = useFormContext();
  const t = useTranslations("forms.fill.photo");
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useMediaUpload(uploadContext);

  return (
    <Controller
      name={field.id}
      control={control}
      render={({ field: f }) => (
        <div className="flex flex-col items-center gap-5">
          <div className="relative aspect-[120/260] w-full max-w-52 overflow-hidden rounded-2xl bg-slate-950">
            <svg viewBox="0 0 120 260" className="absolute inset-0 m-auto h-[90%] w-[90%] opacity-50" fill="none" aria-hidden="true">
              <ellipse cx="60" cy="34" rx="21" ry="25" stroke="#EA580C" strokeWidth="1.6" strokeDasharray="5 5" />
              <path d="M32 78 h56 v92 h-56 z" stroke="#EA580C" strokeWidth="1.6" strokeDasharray="5 5" />
              <path d="M32 82 L14 158 M88 82 L106 158" stroke="#EA580C" strokeWidth="1.6" strokeDasharray="5 5" />
              <path d="M45 170 L41 250 M75 170 L79 250" stroke="#EA580C" strokeWidth="1.6" strokeDasharray="5 5" />
            </svg>
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-0 top-1/3 h-px bg-white/10" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-white/10" />
              <div className="absolute inset-y-0 start-1/3 w-px bg-white/10" />
              <div className="absolute inset-y-0 start-2/3 w-px bg-white/10" />
            </div>
            {f.value && (
              <span className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-md bg-slate-950/80 px-2.5 py-1 font-mono text-[10px] tracking-wider text-slate-300">
                {t("retake")}
              </span>
            )}
          </div>
          <p className="text-center text-xs text-muted-foreground">{t("hint")}</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const path = await upload(file);
              if (path) f.onChange(path);
            }}
          />
          <div className="flex items-center gap-6">
            {f.value && (
              <Button type="button" variant="outline" className="h-11" onClick={() => f.onChange(undefined)}>
                {t("remove")}
              </Button>
            )}
            <button
              type="button"
              aria-label={t("capture")}
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="flex size-18 items-center justify-center rounded-full border-4 border-foreground bg-primary text-primary-foreground disabled:opacity-50"
            >
              <Camera className="size-6" />
            </button>
          </div>
        </div>
      )}
    />
  );
}
