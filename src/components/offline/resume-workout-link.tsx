"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const LAST_WORKOUT_KEY = "coachly:last-workout";

const noSubscribe = () => () => {};

function readLastWorkout(): string | null {
  try {
    const path = localStorage.getItem(LAST_WORKOUT_KEY);
    // Same-origin path only — never follow an arbitrary stored URL.
    return path?.startsWith("/") && !path.startsWith("//") ? path : null;
  } catch {
    return null;
  }
}

/** Offline fallback page action: jump back into the workout opened last. A
 * plain <a> (full navigation) so the service worker serves its cached copy. */
export function ResumeWorkoutLink() {
  const t = useTranslations("offline.page");
  const href = useSyncExternalStore(noSubscribe, readLastWorkout, () => null);
  if (!href) return null;
  return (
    <a href={href} className={cn(buttonVariants(), "w-full")}>
      {t("resume")}
    </a>
  );
}
