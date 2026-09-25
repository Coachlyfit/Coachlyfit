"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { logActivityAction } from "@/domain/workouts/workouts-actions";

export type ActivityLogTarget = {
  id: string;
  kind: string;
  modality: string;
  duration_min: number | null;
  distance_km: number | null;
};

/** Client-facing log sheet for one cardio/recovery activity — mirrors
 * ExerciseFeedbackSheet's "sheet with a few fields, one save button"
 * pattern. Pre-fills duration/distance from the coach's prescription so
 * logging "as prescribed" is a single tap; the client only edits a field
 * when what they actually did differs. */
export function ActivityLogSheet({
  activity,
  open,
  onOpenChange,
  onLogged,
}: {
  activity: ActivityLogTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogged?: () => void;
}) {
  const t = useTranslations("client.today.activityLog");
  const [pending, startTransition] = useTransition();
  const [durationMin, setDurationMin] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [notes, setNotes] = useState("");

  // Reset the form's prefill whenever a different activity opens — a plain
  // useState default only runs once per mount, and this sheet stays mounted
  // across opens (same component, different `activity` prop).
  const [lastActivityId, setLastActivityId] = useState<string | null>(null);
  if (activity && activity.id !== lastActivityId) {
    setLastActivityId(activity.id);
    setDurationMin(activity.duration_min != null ? String(activity.duration_min) : "");
    setDistanceKm(activity.distance_km != null ? String(activity.distance_km) : "");
    setNotes("");
  }

  function save() {
    if (!activity) return;
    startTransition(async () => {
      const result = await logActivityAction(activity.id, {
        duration_min: durationMin ? Number(durationMin) : null,
        distance_km: distanceKm ? Number(distanceKm) : null,
        notes: notes || null,
      });
      if ("error" in result) {
        toast.error(result.error === "entry_locked" ? t("entryLocked") : t("saveFailed"));
        return;
      }
      onLogged?.();
      onOpenChange(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex flex-col gap-4 rounded-t-2xl p-5">
        <SheetTitle>{t("title")}</SheetTitle>
        <div className="flex flex-col gap-2">
          <Label htmlFor="activity-duration">{t("durationMin")}</Label>
          <Input
            id="activity-duration"
            type="number"
            min={1}
            max={600}
            value={durationMin}
            onChange={(e) => setDurationMin(e.target.value)}
          />
        </div>
        {activity?.kind === "cardio" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="activity-distance">{t("distanceKm")}</Label>
            <Input
              id="activity-distance"
              type="number"
              step="0.01"
              min={0.01}
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
            />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="activity-notes">{t("notes")}</Label>
          <Input id="activity-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <Button type="button" onClick={save} disabled={pending} className="mt-2">
          {t("save")}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
