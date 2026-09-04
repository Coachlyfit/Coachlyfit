"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ExerciseFeedbackValues = {
  pain: number | null;
};

function ScaleRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  options: number[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(value === v ? null : v)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition",
              value === v ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
            )}
          >
            {v}
          </button>
        ))}
      </div>
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

        <ScaleRow label={t("pain")} value={pain} onChange={setPain} options={[0, 1, 2, 3, 4, 5]} />

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
