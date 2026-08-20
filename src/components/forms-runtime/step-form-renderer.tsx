"use client";

import { useState } from "react";
import { useForm, useWatch, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApertureSweep } from "@/components/brand/aperture-sweep";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { buildAnswerSchema } from "@/domain/forms/derive";
import { formatNumber } from "@/lib/format";
import type { FormField } from "@/domain/forms/schema";
import type { LibraryRefOption } from "@/domain/forms/library-refs";
import { visibleStepFields } from "./step-derive";
import { StepFieldInput } from "./step-field-input";
import { ReadonlyAnswer } from "./readonly-answer";

type StepFormRendererProps = {
  fields: FormField[];
  coachName: string;
  formName: string;
  previousAnswers?: Record<string, unknown> | null;
  onSubmit: (answers: Record<string, unknown>) => Promise<{ error?: string } | void>;
  exerciseOptions?: LibraryRefOption[];
  foodOptions?: LibraryRefOption[];
  uploadContext?: { coachId: string; clientId: string };
  onDone: () => void;
};

type Phase = "intro" | "step" | "review" | "done";

/** The design's 7-screen paged fill flow: intro, one screen per visible
 * field, review, done. Reuses buildAnswerSchema/isFieldVisible/FieldInput
 * from FormRenderer's `fill` mode rather than forking validation — this is
 * a different shell around the same answer contract, not a new one. */
export function StepFormRenderer({
  fields,
  coachName,
  formName,
  previousAnswers,
  onSubmit,
  exerciseOptions,
  foodOptions,
  uploadContext,
  onDone,
}: StepFormRendererProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("forms.fill");
  const tErrors = useTranslations("forms.errors");
  const [phase, setPhase] = useState<Phase>("intro");
  const [stepIndex, setStepIndex] = useState(0);
  const [returnToReview, setReturnToReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const methods = useForm<Record<string, unknown>>({
    resolver: zodResolver(buildAnswerSchema({ fields })),
    defaultValues: {},
  });
  const values = useWatch({ control: methods.control });
  const stepFields = visibleStepFields(fields, values);
  const requiredCount = stepFields.filter((f) => f.required).length;
  const estimatedMinutes = Math.max(1, Math.round(stepFields.length * 0.4)); // ponytail: heuristic, not measured — revisit if it drifts from real completion time

  const currentField = stepFields[stepIndex];

  async function goNext() {
    if (!currentField) return;
    const valid = await methods.trigger(currentField.id);
    if (!valid) return;
    if (returnToReview) {
      setReturnToReview(false);
      setPhase("review");
      return;
    }
    if (stepIndex + 1 < stepFields.length) {
      setStepIndex((i) => i + 1);
    } else {
      setPhase("review");
    }
  }

  function goBack() {
    if (returnToReview) {
      setReturnToReview(false);
      setPhase("review");
      return;
    }
    if (stepIndex > 0) {
      setStepIndex((i) => i - 1);
    } else {
      setPhase("intro");
    }
  }

  function editField(fieldId: string) {
    const index = stepFields.findIndex((f) => f.id === fieldId);
    if (index === -1) return;
    setStepIndex(index);
    setReturnToReview(true);
    setPhase("step");
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    const result = await onSubmit(methods.getValues());
    setSubmitting(false);
    if (result?.error) {
      setSubmitError(result.error);
      return;
    }
    setPhase("done");
  }

  if (phase === "intro") {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center px-2 pb-10 pt-6 text-center">
        <div className="flex size-19 items-center justify-center rounded-full bg-[#7C3AED] text-2xl font-semibold text-white">
          {coachName.slice(0, 1)}
        </div>
        <h1 className="mt-5 max-w-[18ch] text-2xl font-semibold leading-snug tracking-tight text-foreground">
          {t("intro.eyebrow", { coach: coachName, form: formName })}
        </h1>
        <p className="mt-3.5 max-w-[30ch] text-sm leading-relaxed text-muted-foreground">
          {t("intro.body", { coach: coachName })}
        </p>
        <div className="mt-8 flex w-full flex-col gap-2.5">
          <IntroStat value={formatNumber(stepFields.length, locale)}>
            {t("intro.questionCount", { count: stepFields.length, requiredCount })}
          </IntroStat>
          <IntroStat value={formatNumber(estimatedMinutes, locale)}>{t("intro.duration", { minutes: estimatedMinutes })}</IntroStat>
          <IntroStat value="◔">{t("intro.resume")}</IntroStat>
        </div>
        <div className="mt-auto flex w-full flex-col gap-3.5 pt-10">
          <Button className="h-13 w-full text-base" onClick={() => setPhase("step")}>
            {t("intro.cta")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("intro.privacy", { coach: coachName })}</p>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-7 px-4 text-center">
        <ApertureSweep size={96} />
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t("done.title", { coach: coachName })}</h1>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {t("done.body")}
          </p>
        </div>
        <div className="flex w-full items-center gap-3 rounded-xl border border-border bg-muted/40 p-4">
          <div className="flex size-9.5 flex-none items-center justify-center rounded-full bg-[#7C3AED] text-sm font-semibold text-white">
            {coachName.slice(0, 1)}
          </div>
          <div className="min-w-0 text-start">
            <div className="text-sm font-semibold text-foreground">{coachName}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{t("done.seenNow")}</div>
          </div>
        </div>
        <Button variant="outline" onClick={onDone}>
          {t("done.close")}
        </Button>
      </div>
    );
  }

  return (
    <FormProvider {...methods}>
      <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
        {phase === "step" && currentField && (
          <>
            <div className="flex items-center gap-3.5 pb-2 pt-1">
              <button
                type="button"
                onClick={goBack}
                className="flex size-10 flex-none items-center justify-center text-muted-foreground"
                aria-label={t("step.back")}
              >
                <ArrowRight className="size-4.5 rtl:rotate-180" />
              </button>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${((stepIndex + 1) / stepFields.length) * 100}%` }}
                />
              </div>
              <span className="flex-none font-mono text-xs text-muted-foreground">
                {t("step.of", {
                  current: formatNumber(stepIndex + 1, locale),
                  total: formatNumber(stepFields.length, locale),
                })}
              </span>
            </div>

            <div className="flex flex-1 flex-col pt-8">
              <h2 className="text-2xl font-semibold leading-snug tracking-tight text-foreground">
                {pickLocale(currentField.label, locale)}
              </h2>
              {currentField.help && (
                <p className="mt-2.5 text-sm text-muted-foreground">{pickLocale(currentField.help, locale)}</p>
              )}
              <div className="mt-9 flex flex-1 flex-col justify-center">
                <StepFieldInput
                  field={currentField}
                  refOptions={currentField.type === "exercise_ref" ? exerciseOptions : foodOptions}
                  uploadContext={uploadContext}
                  delta={
                    currentField.type === "number" &&
                    typeof previousAnswers?.[currentField.id] === "number" &&
                    typeof values[currentField.id] === "number"
                      ? (values[currentField.id] as number) - (previousAnswers[currentField.id] as number)
                      : undefined
                  }
                />
              </div>
              {methods.formState.errors[currentField.id] && (
                <p className="mt-3 text-center text-sm text-destructive">
                  {String(methods.formState.errors[currentField.id]?.message)}
                </p>
              )}
            </div>

            <div className="pb-6 pt-5">
              <Button className="h-13 w-full text-base" onClick={goNext}>
                {t("step.next")}
              </Button>
            </div>
          </>
        )}

        {phase === "review" && (
          <>
            <div className="pb-4 pt-2">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("review.title")}</h1>
              <p className="mt-1 text-xs text-muted-foreground">{t("review.subtitle")}</p>
            </div>
            <div className="flex flex-1 flex-col gap-2.5">
              {stepFields.map((field) => (
                <div
                  key={field.id}
                  className="flex items-center gap-3.5 rounded-xl border border-border bg-card p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground">{pickLocale(field.label, locale)}</div>
                    <div className="mt-0.5">
                      <ReadonlyAnswer
                        field={field}
                        value={values[field.id]}
                        locale={locale}
                        refOptions={field.type === "exercise_ref" ? exerciseOptions : foodOptions}
                      />
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => editField(field.id)}>
                    {t("review.edit")}
                  </Button>
                </div>
              ))}
            </div>
            {submitError && (
              <p className="mt-3 text-center text-sm text-destructive">
                {tErrors(submitError as Parameters<typeof tErrors>[0])}
              </p>
            )}
            <div className="pb-6 pt-5">
              <Button className="h-13 w-full text-base" onClick={handleSubmit} disabled={submitting}>
                {t("review.submit", { coach: coachName })}
              </Button>
            </div>
          </>
        )}
      </div>
    </FormProvider>
  );
}

function IntroStat({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[11px] bg-muted/50 px-4 py-3.5">
      <span className="flex-none font-mono text-xs font-semibold text-primary">{value}</span>
      <span className="text-start text-sm text-muted-foreground">{children}</span>
    </div>
  );
}

