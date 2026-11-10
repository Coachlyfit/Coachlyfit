"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { pickBilingual, type AppLocale } from "@/domain/locale";
import { buildAnswerSchema, isEmptyAnswer, isFieldVisible } from "@/domain/forms/derive";
import type { FormField } from "@/domain/forms/schema";
import type { LibraryRefOption } from "@/domain/forms/library-refs";
import { FillFieldInput } from "./fill-field-input";
import { ReadonlyAnswer } from "./readonly-answer";
import { visibleStepFields } from "./step-derive";

type Result = { error?: string } | void;
type Answers = Record<string, unknown>;

export type FillFormProps = {
  formName: string;
  fields: FormField[];
  /** Saved draft answers to resume from (empty for a fresh form). */
  initialAnswers: Answers;
  /** Where the mobile flow was left; falls back to the first unanswered one. */
  initialFieldId: string | null;
  previousAnswers?: Answers | null;
  uploadContext?: { coachId: string; clientId: string };
  exerciseOptions?: LibraryRefOption[];
  foodOptions?: LibraryRefOption[];
  /** Consecutive-day count including this submission, or null when this isn't a daily form. */
  streakCount: number | null;
  onSaveDraft: (answers: Answers, currentFieldId: string | null) => Promise<Result>;
  onSubmit: (answers: Answers) => Promise<Result>;
  onDone: () => void;
};

const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** null on the server and during hydration: the two layouts are different
 * trees, so render neither until the viewport is known instead of flashing
 * the wrong one. */
function useIsDesktop(): boolean | null {
  return useSyncExternalStore<boolean | null>(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => null
  );
}

/** Desktop grid: short single-line inputs share a row, everything else spans. */
const SHORT_TYPES = new Set<FormField["type"]>(["number", "text", "date", "select", "exercise_ref", "food_ref"]);

const AUTOSAVE_DELAY_MS = 800;

export function FillForm(props: FillFormProps) {
  const { formName, fields, initialAnswers, initialFieldId, previousAnswers, onSaveDraft, onSubmit, onDone } = props;
  const locale = useLocale() as AppLocale;
  const t = useTranslations("forms.fill");
  const tErrors = useTranslations("forms.errors");
  const isDesktop = useIsDesktop();

  const [phase, setPhase] = useState<"fill" | "done">("fill");
  const [stepIndex, setStepIndex] = useState(() => {
    const steps = visibleStepFields(fields, initialAnswers);
    const saved = steps.findIndex((f) => f.id === initialFieldId);
    if (saved >= 0) return saved;
    return Math.max(0, steps.findIndex((f) => isEmptyAnswer(initialAnswers[f.id])));
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);
  const submitted = useRef(false);

  const methods = useForm<Answers>({
    resolver: zodResolver(buildAnswerSchema({ fields })),
    defaultValues: initialAnswers,
  });
  const values = useWatch({ control: methods.control }) as Answers;
  const stepFields = visibleStepFields(fields, values);
  const index = Math.min(stepIndex, Math.max(0, stepFields.length - 1));
  const current = stepFields[index];
  const currentFieldId = isDesktop === false ? (current?.id ?? null) : null;

  // --- autosave -------------------------------------------------------------
  const debouncedValues = useDebouncedValue(values, AUTOSAVE_DELAY_MS);
  const lastSaved = useRef<string | null>(null);

  async function persist(answers: Answers, fieldId: string | null) {
    if (submitted.current) return;
    const snapshot = JSON.stringify([answers, fieldId]);
    if (snapshot === lastSaved.current) return;
    lastSaved.current = snapshot;
    await onSaveDraft(answers, fieldId);
  }
  const persistRef = useRef(persist);
  useEffect(() => {
    persistRef.current = persist;
  });

  useEffect(() => {
    // Until the viewport is known the field id isn't meaningful (it flips from
    // null to the real step), so wait; then the first run only records the
    // baseline, so merely opening a form doesn't create a draft.
    if (isDesktop === null) return;
    if (lastSaved.current === null) {
      lastSaved.current = JSON.stringify([debouncedValues, currentFieldId]);
      return;
    }
    void persistRef.current(debouncedValues, currentFieldId);
  }, [debouncedValues, currentFieldId, isDesktop]);

  // Leaving by any route (back button, nav tap) still saves what's pending.
  const latest = useRef({ answers: initialAnswers as Answers, fieldId: currentFieldId });
  useEffect(() => {
    latest.current = { answers: values, fieldId: currentFieldId };
  });
  useEffect(
    () => () => {
      if (lastSaved.current !== null) void persistRef.current(latest.current.answers, latest.current.fieldId);
    },
    []
  );

  async function close() {
    await persist(methods.getValues(), currentFieldId);
    onDone();
  }

  // --- submit ---------------------------------------------------------------
  function submit() {
    if (submitting.current) return;
    submitting.current = true;
    startTransition(async () => {
      try {
        setSubmitError(null);
        const valid = await methods.trigger();
        if (!valid) {
          const firstBad = stepFields.findIndex((f) => methods.getFieldState(f.id).error);
          if (firstBad >= 0) setStepIndex(firstBad);
          return;
        }
        const result = await onSubmit(methods.getValues());
        if (result?.error) {
          setSubmitError(result.error);
          return;
        }
        submitted.current = true;
        setPhase("done");
      } finally {
        submitting.current = false;
      }
    });
  }

  async function next() {
    if (!current) return submit();
    if (!(await methods.trigger(current.id))) return;
    if (index >= stepFields.length - 1) return submit();
    setStepIndex(index + 1);
  }

  // Move focus to the new question so screen-reader users hear it.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    titleRef.current?.focus();
  }, [index]);

  const refOptionsFor = (field: FormField) =>
    field.type === "exercise_ref" ? props.exerciseOptions : field.type === "food_ref" ? props.foodOptions : undefined;
  const errorText = (id: string) => (methods.formState.errors[id] ? t("fieldError") : null);
  const submitErrorText = submitError ? tErrors(submitError as Parameters<typeof tErrors>[0]) : null;

  if (isDesktop === null) {
    return (
      <div className="flex flex-col gap-4 p-5" aria-busy="true">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (phase === "done") {
    return (
      <SubmittedSummary
        desktop={isDesktop}
        fields={stepFields}
        values={values}
        streakCount={props.streakCount}
        refOptionsFor={refOptionsFor}
        onDone={onDone}
      />
    );
  }

  // --- desktop: everything on one page --------------------------------------
  if (isDesktop) {
    const shown = fields.filter((f) => isFieldVisible(f, values));
    const questions = shown.filter((f) => f.type !== "section");
    const answered = questions.filter((f) => !isEmptyAnswer(values[f.id])).length;
    const remaining = questions.filter((f) => f.required && isEmptyAnswer(values[f.id])).length;

    return (
      <FormProvider {...methods}>
        <section aria-labelledby="fill-title" className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-col gap-2.5 border-b border-border px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="fill-title" className="text-xl font-bold">
                {formName}
              </h2>
              <span className="text-muted-foreground">
                {t("autosaveShort")} ·{" "}
                <span dir="ltr" className="font-mono tabular-nums">
                  {formatNumber(answered, locale)}/{formatNumber(questions.length, locale)}
                </span>
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={t("progress")}
              aria-valuemin={0}
              aria-valuemax={questions.length}
              aria-valuenow={answered}
              className="h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${questions.length ? (answered / questions.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="grid gap-x-5 gap-y-6 p-6 sm:grid-cols-2">
            {shown.map((field) =>
              field.type === "section" ? (
                <h3 key={field.id} className="border-b border-border pb-1 font-semibold text-muted-foreground sm:col-span-2">
                  {pickBilingual(field.label, locale)}
                </h3>
              ) : (
                <div key={field.id} className={cn("flex min-w-0 flex-col gap-2", !SHORT_TYPES.has(field.type) && "sm:col-span-2")}>
                  <label id={`q-${field.id}`} htmlFor={field.id} className="text-base font-semibold">
                    {pickBilingual(field.label, locale)}
                    {field.required ? (
                      <>
                        <span aria-hidden="true" className="text-destructive"> *</span>
                        <span className="sr-only"> ({t("requiredMark")})</span>
                      </>
                    ) : (
                      <span className="ms-1.5 text-sm font-normal text-muted-foreground">({t("optional")})</span>
                    )}
                  </label>
                  {field.help && <p className="text-sm text-muted-foreground">{pickBilingual(field.help, locale)}</p>}
                  <FillFieldInput
                    field={field}
                    labelId={`q-${field.id}`}
                    compact
                    previousValue={previousAnswers?.[field.id]}
                    refOptions={refOptionsFor(field)}
                    uploadContext={props.uploadContext}
                  />
                  {errorText(field.id) && (
                    <p role="alert" className="text-sm text-destructive">
                      {errorText(field.id)}
                    </p>
                  )}
                </div>
              )
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-6 py-4">
            <span className={cn("text-sm", submitErrorText ? "text-destructive" : "text-muted-foreground")} role={submitErrorText ? "alert" : undefined}>
              {submitErrorText ?? (remaining > 0 ? t("remainingRequired", { count: remaining }) : t("readyToSubmit"))}
            </span>
            <Button className="h-12 px-7 text-base" onClick={submit} disabled={pending || remaining > 0}>
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {t("submitToCoach")}
            </Button>
          </div>
        </section>
      </FormProvider>
    );
  }

  // --- mobile: one question per screen --------------------------------------
  const total = stepFields.length;
  const last = index >= total - 1;
  const empty = current ? isEmptyAnswer(values[current.id]) : true;
  const blocked = !!current?.required && empty;
  const nextLabel = last ? t("send") : !current?.required && empty ? t("skip") : t("next");

  return (
    <FormProvider {...methods}>
      <div className="flex h-dvh flex-col">
        <header className="flex shrink-0 flex-col gap-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={close}
              aria-label={t("close")}
              className="flex size-11 shrink-0 items-center justify-center rounded-xl text-foreground hover:bg-muted"
            >
              <X className="size-6" aria-hidden="true" />
            </button>
            <div className="flex min-w-0 flex-1 flex-col text-center leading-tight">
              <span className="truncate font-semibold">{formName}</span>
              <span className="text-xs text-muted-foreground">{t("autosave")}</span>
            </div>
            <span dir="ltr" className="w-11 shrink-0 text-center font-mono text-sm tabular-nums text-muted-foreground">
              {formatNumber(index + 1, locale)}/{formatNumber(total, locale)}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={t("progress")}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={index + 1}
            className="flex gap-1"
          >
            {stepFields.map((f, i) => (
              <span
                key={f.id}
                className={cn("h-1.5 flex-1 rounded-full", i < index ? "bg-primary" : i === index ? "bg-primary/50" : "bg-muted")}
              />
            ))}
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-6 overflow-y-auto py-5">
          {current ? (
            <>
              <div className="flex flex-col gap-1.5">
                <h1 id={`q-${current.id}`} ref={titleRef} tabIndex={-1} className="text-2xl font-bold leading-snug outline-none">
                  {pickBilingual(current.label, locale)}
                  {current.required && (
                    <>
                      <span aria-hidden="true" className="text-destructive"> *</span>
                      <span className="sr-only"> ({t("requiredMark")})</span>
                    </>
                  )}
                </h1>
                {current.help && <p className="text-muted-foreground">{pickBilingual(current.help, locale)}</p>}
              </div>
              <FillFieldInput
                key={current.id}
                field={current}
                labelId={`q-${current.id}`}
                previousValue={previousAnswers?.[current.id]}
                refOptions={refOptionsFor(current)}
                uploadContext={props.uploadContext}
              />
              {errorText(current.id) && (
                <p role="alert" className="text-sm text-destructive">
                  {errorText(current.id)}
                </p>
              )}
            </>
          ) : null}
          {submitErrorText && (
            <p role="alert" className="text-sm text-destructive">
              {submitErrorText}
            </p>
          )}
        </main>

        <footer className="flex shrink-0 gap-2.5 border-t border-border pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {index > 0 && (
            <Button type="button" variant="secondary" className="h-13 px-5 text-base" onClick={() => setStepIndex(index - 1)}>
              {t("back")}
            </Button>
          )}
          <Button type="button" className="h-13 flex-1 text-base" onClick={next} disabled={blocked || pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {nextLabel}
          </Button>
        </footer>
      </div>
    </FormProvider>
  );
}

function SubmittedSummary({
  desktop,
  fields,
  values,
  streakCount,
  refOptionsFor,
  onDone,
}: {
  desktop: boolean;
  fields: FormField[];
  values: Answers;
  streakCount: number | null;
  refOptionsFor: (field: FormField) => LibraryRefOption[] | undefined;
  onDone: () => void;
}) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("forms.fill");
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 text-center",
        desktop ? "rounded-2xl border border-border bg-card p-10" : "min-h-dvh justify-center py-8"
      )}
    >
      <span className="flex size-22 items-center justify-center rounded-full bg-success-tint text-success-tint-foreground">
        <Check className="size-10" strokeWidth={2.4} aria-hidden="true" />
      </span>
      <h1 className="text-2xl font-bold" role="status">
        {t("done.title")}
      </h1>
      {streakCount !== null && streakCount >= 2 && (
        <p className="text-base text-muted-foreground">{t("done.streak", { count: streakCount })}</p>
      )}
      <dl className="flex w-full max-w-md flex-col gap-2 rounded-2xl bg-muted/50 p-4 text-start">
        {fields.map((field) => (
          <div key={field.id} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{pickBilingual(field.label, locale)}</dt>
            <dd className="text-end font-semibold">
              <ReadonlyAnswer field={field} value={values[field.id]} locale={locale} refOptions={refOptionsFor(field)} />
            </dd>
          </div>
        ))}
      </dl>
      <Button className="h-13 w-full max-w-md text-base" onClick={onDone}>
        {t("done.ok")}
      </Button>
    </div>
  );
}
