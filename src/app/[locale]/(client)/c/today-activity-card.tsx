"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, HeartPulse, Wind } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import { ActivityLogSheet } from "@/components/workout/activity-log-sheet";

type Activity = {
  id: string;
  kind: string;
  modality: string;
  duration_min: number | null;
  distance_km: number | null;
  intensity: string | null;
};

const ICON_BY_KIND = { cardio: HeartPulse, recovery: Wind } as const;

/** One cardio/recovery card on the client's Today agenda — shows the
 * prescription, a Log button (opens ActivityLogSheet), and a done tick once
 * today's entry exists. router.refresh() after logging re-derives
 * `logged` server-side from activity_logs rather than tracking it as local
 * client state, same "server is the source of truth" approach the workout
 * session runner uses for its own completion state. */
export function TodayActivityCard({
  locale,
  activity,
  logged,
}: {
  locale: AppLocale;
  activity: Activity;
  logged: boolean;
}) {
  const t = useTranslations("client.today");
  const tActivity = useTranslations("programs.activityDialog");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const Icon = ICON_BY_KIND[activity.kind as "cardio" | "recovery"];
  const parts = [
    tActivity(`modalities.${activity.modality}`),
    activity.duration_min ? `${activity.duration_min} ${tActivity("minShort")}` : null,
    activity.distance_km ? `${activity.distance_km}km` : null,
  ].filter(Boolean);

  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3.5">
        <Icon
          className={cn("size-5 shrink-0", activity.kind === "cardio" ? "text-orange-500" : "text-sky-500")}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t(activity.kind === "cardio" ? "cardioTitle" : "recoveryTitle")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{parts.join(" · ")}</p>
        </div>
        {logged ? (
          <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
            {t("logActivity")}
          </Button>
        )}
      </CardContent>
      <ActivityLogSheet
        activity={activity}
        open={open}
        onOpenChange={setOpen}
        onLogged={() => router.refresh()}
      />
    </Card>
  );
}
