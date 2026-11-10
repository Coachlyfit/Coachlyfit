"use client";

import { useSyncExternalStore } from "react";

export type MealSlot = { label: string | null; time: string };

function subscribeMinute(onChange: () => void) {
  const id = setInterval(onChange, 60_000);
  return () => clearInterval(id);
}

function minuteOfDay() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** "Next meal: Lunch · 13:30", picked against the device clock — the server
 * only knows UTC, which is hours off for the client. Renders nothing during
 * SSR/hydration, when no meal has a time, or once today's meals are past. */
export function NextMeal({ meals, heading, fallbackLabel }: { meals: MealSlot[]; heading: string; fallbackLabel: string }) {
  const now = useSyncExternalStore(subscribeMinute, minuteOfDay, () => null);
  if (now == null) return null;

  const next = meals
    .map((m) => ({ ...m, minutes: Number(m.time.slice(0, 2)) * 60 + Number(m.time.slice(3, 5)) }))
    .filter((m) => Number.isFinite(m.minutes) && m.minutes >= now)
    .sort((a, b) => a.minutes - b.minutes)[0];
  if (!next) return null;

  return (
    <span className="text-sm text-muted-foreground">
      {heading}: {next.label ?? fallbackLabel} ·{" "}
      <span dir="ltr" className="font-mono tabular-nums">
        {next.time.slice(0, 5)}
      </span>
    </span>
  );
}
