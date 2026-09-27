"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScaleButtons } from "@/components/ui/scale-buttons";

export type ExerciseFeedbackValues = {
  pain: number | null;
};

function ScaleRow({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <ScaleButtons value={value ?? undefined} onChange={(v) => onChange(value === v ? null : v)} min={min} max={max} />
    </div>
  );
}

/** Shown once a client marks an exercise done — optional, one tap to skip.
 * Feeds workout_exercise_results, which the coach's review console and
 * client-detail compliance view surface (pain > 0 is highlighted there). */
export function ExerciseFeedbackSheet({
  open,
  onOpenChange,
  onSave,
  onSkip,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: ExerciseFeedbackValues) => void;
  onSkip: () => void;
}) {
  const t = useTranslations("client.workout.feedback");
  const [pain, setPain] = useState<number | null>(null);

  function handleSave() {
    onSave({ pain });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex flex-col gap-5 rounded-t-2xl p-5">
        <SheetTitle>{t("title")}</SheetTitle>

        <ScaleRow label={t("pain")} value={pain} onChange={setPain} min={0} max={5} />

        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onSkip} className="flex-1">
            {t("skip")}
          </Button>
          <Button type="button" onClick={handleSave} className="flex-1">
            {t("save")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
