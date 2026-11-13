"use client";

import { useWatch, type Control } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cleanRows, type ContentLang, type ExerciseFormValues } from "@/domain/library/exercise-form";
import { resolveExerciseMedia } from "@/lib/video-embed";
import { ExerciseMedia } from "./exercise-card";

/** How the client will see the exercise, in the language the coach is
 * editing. Reads the live form values, so it re-renders on every keystroke
 * without the dialog around it doing so. Badge labels (muscle group, type)
 * stay in the interface language — only one message catalog is loaded. */
export function ExercisePreview({ control, lang }: { control: Control<ExerciseFormValues>; lang: ContentLang }) {
  const t = useTranslations("library.exercise");
  const tf = useTranslations("library.exercise.form");
  const tGroups = useTranslations("library.muscleGroups");
  const tTypes = useTranslations("measure.types");
  const v = useWatch({ control });

  const dir = lang === "ar" ? "rtl" : "ltr";
  const name = (lang === "ar" ? v.name_ar : v.name_en)?.trim();
  const cues = cleanRows(lang === "ar" ? v.cues_ar : v.cues_en);
  const media = resolveExerciseMedia(v.video_url || v.image_url);

  return (
    <aside
      aria-label={tf("preview.title")}
      className="hidden min-h-0 flex-col gap-3 overflow-y-auto border-s bg-background p-4 lg:flex"
    >
      <h3 className="text-sm font-semibold">{tf("preview.title")}</h3>
      <div className="flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <ExerciseMedia media={media} name={name || tf("preview.namePlaceholder")} className="aspect-[16/10]" />
        <div className="flex flex-col gap-2.5 p-3.5" dir={dir}>
          <span
            className={name ? "text-[17px] leading-snug font-bold" : "text-[17px] leading-snug font-bold text-muted-foreground"}
          >
            {name || tf("preview.namePlaceholder")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {v.muscle_group && <Badge variant="info">{tGroups(v.muscle_group)}</Badge>}
            {v.measurement_type && <Badge variant="secondary">{tTypes(v.measurement_type)}</Badge>}
            {v.difficulty && <Badge variant="secondary">{t(`difficultyLevel.${v.difficulty}`)}</Badge>}
          </div>
          {cues.length > 0 && (
            <ol className="flex flex-col gap-1.5 text-sm">
              {cues.map((cue, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span className="font-mono font-semibold text-primary tabular-nums">{i + 1}</span>
                  <span className="min-w-0 break-words">{cue}</span>
                </li>
              ))}
            </ol>
          )}
          {v.tempo && (
            <div className="flex items-center justify-between border-t pt-2.5 text-sm text-muted-foreground">
              <span>{t("tempo")}</span>
              <span dir="ltr" className="font-mono font-semibold text-foreground">{v.tempo}</span>
            </div>
          )}
        </div>
      </div>
      <p className="text-[13px] text-muted-foreground">{tf("preview.hint")}</p>
    </aside>
  );
}
