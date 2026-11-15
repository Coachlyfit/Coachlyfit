"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { startSessionAction } from "@/domain/workouts/workouts-actions";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { TodayExercisePreview } from "../../today-exercise-preview";

/** What a day looks like before it's started: no session exists and no timer
 * runs until "Start workout". Leaving this screen leaves nothing behind. */
export function WorkoutPreview({
  locale,
  dayId,
  label,
  items,
  scheduledDate,
  doneOn,
}: {
  locale: AppLocale;
  dayId: string;
  label: string | null;
  items: React.ComponentProps<typeof TodayExercisePreview>["items"];
  /** The day it was scheduled for, when that isn't today. */
  scheduledDate: string | null;
  /** When it was already completed this week. */
  doneOn: string | null;
}) {
  const t = useTranslations("client.workout.preview");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const BackIcon = locale === "ar" ? ChevronRight : ChevronLeft;

  function start() {
    startTransition(async () => {
      const result = await startSessionAction(locale, dayId);
      if ("error" in result) {
        toast.error(t("startFailed"));
        return;
      }
      setConfirming(false);
      // The session may be the one already in progress on another day.
      router.replace(`/c/workout/${result.sessionDayId}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/c/plan" className="flex min-h-11 items-center gap-1 text-sm font-medium text-primary">
        <BackIcon className="size-4" aria-hidden="true" />
        {t("back")}
      </Link>

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{label ?? t("workout")}</h1>
        {doneOn && <Badge variant="success">{t("doneOn", { date: formatDate(doneOn, locale, { day: "numeric", month: "short" }) })}</Badge>}
      </div>

      {scheduledDate && (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          {t("scheduledNote", { day: formatDate(scheduledDate, locale, { weekday: "long" }) })}
        </p>
      )}

      <div className="rounded-2xl border border-border bg-card pt-3.5">
        <TodayExercisePreview locale={locale} items={items} />
      </div>

      <Button size="lg" className="min-h-12" disabled={pending} onClick={() => (doneOn ? setConfirming(true) : start())}>
        {pending && !confirming ? t("starting") : t("start")}
      </Button>

      {doneOn && (
        <Link href={`/c/workout/${dayId}?view=summary`} className="text-center text-sm font-medium text-primary">
          {t("viewSummary")}
        </Link>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("restartTitle")}
        description={t("restartBody")}
        confirmLabel={t("restartConfirm")}
        variant="default"
        pending={pending}
        onConfirm={start}
      />
    </div>
  );
}
