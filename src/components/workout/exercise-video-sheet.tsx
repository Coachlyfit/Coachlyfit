"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Play, ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { resolveExerciseMedia } from "@/lib/video-embed";
import { BodyMap } from "@/components/body-map/body-map";
import { exerciseToBodyState } from "@/domain/library/muscle-regions";

export type VideoSheetExercise = {
  name_ar: string;
  name_en: string;
  video_url: string | null;
  cues_ar?: string[] | null;
  cues_en?: string[] | null;
  steps_ar?: string[] | null;
  steps_en?: string[] | null;
  mistakes_ar?: string[] | null;
  mistakes_en?: string[] | null;
  safety_ar?: string | null;
  safety_en?: string | null;
  tempo?: string | null;
  muscle_group?: string | null;
  primary_muscles?: string[] | null;
  secondary_muscles?: string[] | null;
};

function pickLocaleList(primary: string[] | null | undefined, fallback: string[] | null | undefined): string[] {
  return (primary?.length ? primary : fallback) ?? [];
}

function pickCues(exercise: VideoSheetExercise, locale: AppLocale): string[] {
  return locale === "ar"
    ? pickLocaleList(exercise.cues_ar, exercise.cues_en)
    : pickLocaleList(exercise.cues_en, exercise.cues_ar);
}

function pickSteps(exercise: VideoSheetExercise, locale: AppLocale): string[] {
  return locale === "ar"
    ? pickLocaleList(exercise.steps_ar, exercise.steps_en)
    : pickLocaleList(exercise.steps_en, exercise.steps_ar);
}

function pickMistakes(exercise: VideoSheetExercise, locale: AppLocale): string[] {
  return locale === "ar"
    ? pickLocaleList(exercise.mistakes_ar, exercise.mistakes_en)
    : pickLocaleList(exercise.mistakes_en, exercise.mistakes_ar);
}

function pickSafety(exercise: VideoSheetExercise, locale: AppLocale): string | null {
  const primary = locale === "ar" ? exercise.safety_ar : exercise.safety_en;
  const fallback = locale === "ar" ? exercise.safety_en : exercise.safety_ar;
  return primary || fallback || null;
}

/** The workout form-check sheet — shared by the workout runner (dark, full
 * exercise list) and the Today tab's exercise preview (which only needs the
 * same video/cues lookup for one exercise at a time). Same click-to-play
 * classification as the coach library's ExerciseMedia (exercise-card.tsx):
 * the iframe only mounts on tap, and playback state resets every open
 * because this component unmounts with the sheet (`exercise != null`). */
export function ExerciseVideoSheet({
  locale,
  exercise,
  open,
  onOpenChange,
}: {
  locale: AppLocale;
  exercise: VideoSheetExercise | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("client.workout");
  const tMedia = useTranslations("library.media");
  const [playing, setPlaying] = useState(false);

  const media = exercise ? resolveExerciseMedia(exercise.video_url) : null;
  const cues = exercise ? pickCues(exercise, locale) : [];
  const steps = exercise ? pickSteps(exercise, locale) : [];
  const mistakes = exercise ? pickMistakes(exercise, locale) : [];
  const safety = exercise ? pickSafety(exercise, locale) : null;
  const bodyState = exercise
    ? exerciseToBodyState(exercise.primary_muscles, exercise.secondary_muscles, exercise.muscle_group)
    : {};

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setPlaying(false);
        onOpenChange(next);
      }}
    >
      <SheetContent side="bottom" className="h-auto max-h-[85dvh] rounded-t-2xl border-white/10 bg-[#020617] text-[#E2E8F0]">
        {exercise && (
          <div className="flex flex-col gap-5 px-1 pb-2">
            <SheetTitle className="font-mono text-[10px] tracking-wider text-[#64748B] uppercase">
              {t("formCheck")}
            </SheetTitle>

            {media?.kind === "image" && (
              <div className="aspect-video w-full overflow-hidden rounded-[11px] bg-[#0F172A]">
                <img
                  src={media.src}
                  alt={pickLocale(exercise, locale)}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            {media?.kind === "embed" &&
              (playing ? (
                <div className="aspect-video w-full overflow-hidden rounded-[11px] bg-black">
                  <iframe src={media.src} className="h-full w-full" allowFullScreen title={pickLocale(exercise, locale)} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPlaying(true)}
                  className="relative aspect-video w-full overflow-hidden rounded-[11px] bg-[repeating-linear-gradient(135deg,#131C2F_0_10px,#1B2437_10px_20px)]"
                  aria-label={tMedia("play")}
                >
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex size-14 items-center justify-center rounded-full bg-[#F8FAFC]/95">
                      <Play className="size-5 fill-[#0F172A] text-[#0F172A] ms-0.5" aria-hidden="true" />
                    </span>
                  </span>
                </button>
              ))}

            <div>
              <p className="text-[19px] font-semibold text-[#F8FAFC]">{pickLocale(exercise, locale)}</p>
              {exercise.tempo && (
                <p className="mt-1 font-mono text-[11px] text-[#64748B]">{t("tempo")} {exercise.tempo}</p>
              )}
            </div>

            {Object.keys(bodyState).length > 0 && (
              <BodyMap
                state={bodyState}
                ariaLabel={t("musclesWorked")}
                className="mx-auto max-w-[220px] [&_.body-chart-container]:p-0"
              />
            )}

            {steps.length > 0 && (
              <div>
                <p className="font-mono text-[9.5px] tracking-wider text-[#64748B] uppercase">{t("executionSteps")}</p>
                <ol className="mt-3 flex flex-col gap-3">
                  {steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-[10px] font-semibold text-primary-foreground">
                        {i + 1}
                      </span>
                      <p className="flex-1 text-[13.5px] leading-relaxed text-[#CBD5E1]">{step}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {mistakes.length > 0 && (
              <div>
                <p className="font-mono text-[9.5px] tracking-wider text-[#64748B] uppercase">{t("commonMistakes")}</p>
                <ul className="mt-3 flex flex-col gap-2">
                  {mistakes.map((mistake, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                      <p className="flex-1 text-[13px] leading-relaxed text-[#CBD5E1]">{mistake}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {safety && (
              <div className="rounded-[11px] border border-destructive/30 bg-destructive/5 p-3">
                <p className="font-mono text-[9.5px] tracking-wider text-destructive uppercase">{t("safetyNote")}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed whitespace-pre-line text-[#CBD5E1]">{safety}</p>
              </div>
            )}

            {cues.length > 0 && (
              <div>
                <p className="font-mono text-[9.5px] tracking-wider text-[#64748B] uppercase">{t("performanceCues")}</p>
                <div className="mt-3 flex flex-col gap-3">
                  {cues.map((cue, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-[#1E293B] font-mono text-[10px] font-semibold text-primary">
                        {i + 1}
                      </span>
                      <p className="flex-1 text-[13.5px] leading-relaxed text-[#CBD5E1]">{cue}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {exercise.video_url && (
              <a
                href={exercise.video_url}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-13 items-center gap-3 rounded-[11px] border border-[#1E293B] bg-[#0F172A] px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-[#E2E8F0]">{t("openOriginalVideo")}</p>
                  <p className="mt-0.5 truncate font-mono text-[10.5px] text-[#64748B]">{exercise.video_url}</p>
                </div>
                <ExternalLink className="size-4 shrink-0 text-[#64748B]" aria-hidden="true" />
              </a>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
