"use client";

import { useState } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScaleButtons } from "@/components/ui/scale-buttons";
import { ApertureSweep } from "@/components/brand/aperture-sweep";
import { NumericPad } from "@/components/forms-runtime/numeric-pad";
import { weightTrend } from "@/domain/progress/stats";
import { adherenceFromDb, adherenceToDb } from "@/domain/progress/checkin-wizard";
import { formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import type { Database } from "@/lib/supabase/database.types";
import { checkinSchema, type CheckinFormInput, type CheckinInput } from "../progress/schemas";
import { submitCheckinAction } from "../progress/actions";
import { CameraCapture } from "./camera-capture";

type Checkin = Database["public"]["Tables"]["checkins"]["Row"];

type CheckinStep =
  | { id: "weight"; kind: "number"; unit: "kg" }
  | { id: "sleep_hours"; kind: "number"; unit: "h" }
  | { id: "adherence"; kind: "scale"; min: 1; max: 10 }
  | { id: "mood"; kind: "scale"; min: 1; max: 5 }
  | { id: "energy"; kind: "scale"; min: 1; max: 5 }
  | { id: "photos"; kind: "photos" }
  | { id: "notes"; kind: "textarea" };

// Fixed order matches the classic CheckinForm's field order exactly.
const STEPS: CheckinStep[] = [
  { id: "weight", kind: "number", unit: "kg" },
  { id: "sleep_hours", kind: "number", unit: "h" },
  { id: "adherence", kind: "scale", min: 1, max: 10 },
  { id: "mood", kind: "scale", min: 1, max: 5 },
  { id: "energy", kind: "scale", min: 1, max: 5 },
  { id: "photos", kind: "photos" },
  { id: "notes", kind: "textarea" },
];

const FIELD_LABEL_KEY: Record<CheckinStep["id"], string> = {
  weight: "weight",
  sleep_hours: "sleepHours",
  adherence: "adherence",
  mood: "mood",
  energy: "energy",
  photos: "photos",
  notes: "notes",
};

type Phase = "intro" | "step" | "review" | "done";

/** The design's 7-screen guided check-in: intro, one screen per field
 * (weight, sleep, adherence, mood, energy, photos, notes), review, done.
 * Ports StepFormRenderer's shell (phase state machine, progress bar,
 * RTL-aware back button, review-screen edit-jump) but over a FIXED step
 * list instead of dynamic FormField[] — there's no form builder behind
 * check-ins, so there's nothing to derive. checkinSchema/submitCheckinAction
 * are reused unchanged; photos upload immediately via the same
 * addProgressPhotoAction path the classic CheckinForm uses, decoupled from
 * the final submit exactly as today. */
export function CheckinWizard({
  locale,
  today,
  existing,
  businessName,
  coachId,
  clientId,
  recentCheckins,
  ghostPhotos,
  onDone,
}: {
  locale: AppLocale;
  today: string;
  existing: Checkin | null;
  businessName: string;
  coachId: string;
  clientId: string;
  recentCheckins: Checkin[];
  ghostPhotos: { front?: string; side?: string };
  onDone: () => void;
}) {
  const t = useTranslations("client.checkinWizard");
  const tFields = useTranslations("progress.checkin");
  const tErrors = useTranslations("progress.errors");

  const [phase, setPhase] = useState<Phase>("intro");
  const [stepIndex, setStepIndex] = useState(0);
  const [returnToReview, setReturnToReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [photoStatus, setPhotoStatus] = useState<{ front: boolean; side: boolean }>({ front: false, side: false });

  const methods = useForm<CheckinFormInput, unknown, CheckinInput>({
    resolver: zodResolver(checkinSchema),
    defaultValues: {
      checkin_date: today,
      weight: existing?.weight ?? undefined,
      mood: existing?.mood ?? undefined,
      energy: existing?.energy ?? undefined,
      adherence: existing?.adherence ?? undefined,
      sleep_hours: existing?.sleep_hours ?? undefined,
      notes: existing?.notes ?? undefined,
    },
  });
  const { control, trigger, register, formState } = methods;
  const values = useWatch({ control });

  const trend = weightTrend(recentCheckins);
  const currentStep = STEPS[stepIndex];
  const estimatedMinutes = 2; // ponytail: fixed step count (7), no need for a per-field heuristic

  const adherenceChosen = typeof values.adherence === "number";

  async function goNext() {
    const stepId = currentStep.id;
    if (stepId !== "photos") {
      const valid = await trigger(stepId);
      if (!valid) return;
    }
    if (stepId === "adherence" && !adherenceChosen) return;
    if (returnToReview) {
      setReturnToReview(false);
      setPhase("review");
      return;
    }
    if (stepIndex + 1 < STEPS.length) {
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

  function editStep(id: CheckinStep["id"]) {
    const index = STEPS.findIndex((s) => s.id === id);
    if (index === -1) return;
    setStepIndex(index);
    setReturnToReview(true);
    setPhase("step");
  }

  const onFinalSubmit = methods.handleSubmit(async (data) => {
    setSubmitting(true);
    setSubmitError(null);
    const formData = new FormData();
    formData.set("checkin_date", data.checkin_date);
    if (data.weight !== undefined) formData.set("weight", String(data.weight));
    if (data.mood !== undefined) formData.set("mood", String(data.mood));
    if (data.energy !== undefined) formData.set("energy", String(data.energy));
    if (data.adherence !== undefined) formData.set("adherence", String(data.adherence));
    if (data.sleep_hours !== undefined) formData.set("sleep_hours", String(data.sleep_hours));
    if (data.notes) formData.set("notes", data.notes);
    const result = await submitCheckinAction(locale, formData);
    setSubmitting(false);
    if (result?.error) {
      setSubmitError(result.error);
      return;
    }
    setPhase("done");
  });

  function reviewValue(step: CheckinStep): string {
    if (step.id === "photos") {
      const parts: string[] = [];
      if (photoStatus.front) parts.push(tFields("photoFront"));
      if (photoStatus.side) parts.push(tFields("photoSide"));
      return parts.length > 0 ? parts.join(", ") : t("review.noPhotos");
    }
    if (step.id === "notes") {
      return values.notes ? String(values.notes) : "—";
    }
    if (step.id === "adherence") {
      return typeof values.adherence === "number" ? String(adherenceFromDb(values.adherence)) : "—";
    }
    const raw = values[step.id];
    return typeof raw === "number" ? formatNumber(raw, locale) : "—";
  }

  function renderStepInput(step: CheckinStep) {
    if (step.kind === "number") {
      return (
        <Controller
          name={step.id}
          control={control}
          render={({ field }) => (
            <NumericPad
              value={field.value as number | undefined}
              onChange={field.onChange}
              unit={step.unit}
              delta={step.id === "weight" ? trend?.delta : undefined}
            />
          )}
        />
      );
    }
    if (step.kind === "scale" && step.id === "adherence") {
      return (
        <Controller
          name="adherence"
          control={control}
          render={({ field }) => (
            <ScaleButtons
              value={typeof field.value === "number" ? adherenceFromDb(field.value) : undefined}
              onChange={(v) => field.onChange(adherenceToDb(v))}
              min={step.min}
              max={step.max}
            />
          )}
        />
      );
    }
    if (step.kind === "scale") {
      return (
        <Controller
          name={step.id}
          control={control}
          render={({ field }) => (
            <ScaleButtons value={field.value as number | undefined} onChange={field.onChange} min={step.min} max={step.max} />
          )}
        />
      );
    }
    if (step.kind === "textarea") {
      return <Textarea rows={6} className="min-h-32" {...register("notes")} />;
    }
    return (
      <CameraCapture
        locale={locale}
        coachId={coachId}
        clientId={clientId}
        ghostFront={ghostPhotos.front}
        ghostSide={ghostPhotos.side}
        onUploaded={(pose) => setPhotoStatus((s) => ({ ...s, [pose]: true }))}
      />
    );
  }

  if (phase === "intro") {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center px-2 pb-10 pt-6 text-center">
        <div className="flex size-19 items-center justify-center rounded-full bg-[#7C3AED] text-2xl font-semibold text-white">
          {businessName.slice(0, 1)}
        </div>
        <h1 className="mt-5 max-w-[18ch] text-2xl font-semibold leading-snug tracking-tight text-foreground">
          {t("intro.eyebrow")}
        </h1>
        <p className="mt-3.5 max-w-[30ch] text-sm leading-relaxed text-muted-foreground">
          {t("intro.body", { business: businessName })}
        </p>
        <div className="mt-8 flex w-full flex-col gap-2.5">
          <IntroStat value={formatNumber(STEPS.length, locale)}>{t("intro.questionCount", { count: STEPS.length })}</IntroStat>
          <IntroStat value={formatNumber(estimatedMinutes, locale)}>{t("intro.duration", { minutes: estimatedMinutes })}</IntroStat>
        </div>
        <div className="mt-auto flex w-full flex-col gap-3.5 pt-10">
          <Button className="h-13 w-full text-base" onClick={() => setPhase("step")}>
            {t("intro.cta")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("intro.privacy", { business: businessName })}</p>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-7 px-4 text-center">
        <ApertureSweep size={96} />
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t("done.title")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("done.body")}</p>
        </div>
        <Button variant="outline" onClick={onDone}>
          {t("done.close")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      {phase === "step" && (
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
                style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
              />
            </div>
            <span className="flex-none font-mono text-xs text-muted-foreground">
              {t("step.of", { current: formatNumber(stepIndex + 1, locale), total: formatNumber(STEPS.length, locale) })}
            </span>
          </div>

          <div className="flex flex-1 flex-col pt-8">
            <h2 className="text-2xl font-semibold leading-snug tracking-tight text-foreground">
              {tFields(FIELD_LABEL_KEY[currentStep.id])}
            </h2>
            <div className="mt-9 flex flex-1 flex-col justify-center">{renderStepInput(currentStep)}</div>
            {currentStep.id !== "photos" && formState.errors[currentStep.id] && (
              <p className="mt-3 text-center text-sm text-destructive">
                {String(formState.errors[currentStep.id]?.message)}
              </p>
            )}
          </div>

          <div className="pb-6 pt-5">
            <Button
              className="h-13 w-full text-base"
              onClick={goNext}
              disabled={currentStep.id === "adherence" && !adherenceChosen}
            >
              {currentStep.id === "adherence" && !adherenceChosen ? tFields("chooseAdherence") : t("step.next")}
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
            {STEPS.map((step) => (
              <div key={step.id} className="flex items-center gap-3.5 rounded-xl border border-border bg-card p-4">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">{tFields(FIELD_LABEL_KEY[step.id])}</div>
                  <div className="mt-0.5 text-sm text-foreground">{reviewValue(step)}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => editStep(step.id)}>
                  {t("review.edit")}
                </Button>
              </div>
            ))}
          </div>
          {submitError && <p className="mt-3 text-center text-sm text-destructive">{tErrors(submitError)}</p>}
          <div className="pb-6 pt-5">
            <Button className="h-13 w-full text-base" onClick={() => onFinalSubmit()} disabled={submitting}>
              {t("review.submit", { business: businessName })}
            </Button>
          </div>
        </>
      )}
    </div>
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
