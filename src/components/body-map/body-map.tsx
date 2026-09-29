"use client";

import { useEffect, useRef } from "react";
import { BodyChart, ViewSide, type MuscleId } from "body-muscles";
import type { MuscleRegionState } from "@/domain/library/muscle-regions";

/** Front + back BodyChart pair for one muscle intensity state. Anatomical
 * left/right must stay fixed regardless of page direction, so the wrapper
 * is forced to `dir="ltr"` — under `dir="rtl"` (this app defaults to
 * Arabic, see src/i18n/routing.ts) an unset dir would mirror the SVGs and
 * swap which side is "left". BodyChart is a vanilla DOM class (no React
 * bindings), so each side gets its own instance created once in
 * useEffect/destroyed on unmount, and pushed new state via .update() on
 * every state change rather than being recreated. */
export function BodyMap({
  state,
  onRegionClick,
  ariaLabel,
  className,
}: {
  state: MuscleRegionState;
  onRegionClick?: (id: MuscleId) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const frontChart = useRef<BodyChart | null>(null);
  const backChart = useRef<BodyChart | null>(null);
  // Read in the update effect without retriggering the create effect.
  const onRegionClickRef = useRef(onRegionClick);
  useEffect(() => {
    onRegionClickRef.current = onRegionClick;
  });

  useEffect(() => {
    if (!frontRef.current || !backRef.current) return;

    frontChart.current = new BodyChart(frontRef.current, {
      view: ViewSide.FRONT,
      bodyState: {},
      onMuscleClick: (id) => onRegionClickRef.current?.(id),
    });
    backChart.current = new BodyChart(backRef.current, {
      view: ViewSide.BACK,
      bodyState: {},
      onMuscleClick: (id) => onRegionClickRef.current?.(id),
    });

    return () => {
      frontChart.current?.destroy();
      backChart.current?.destroy();
      frontChart.current = null;
      backChart.current = null;
    };
  }, []);

  useEffect(() => {
    const bodyState = Object.fromEntries(
      Object.entries(state).map(([id, intensity]) => [id, { intensity, selected: false }])
    );
    frontChart.current?.update({ bodyState });
    backChart.current?.update({ bodyState });
  }, [state]);

  return (
    <div dir="ltr" aria-label={ariaLabel} className={className ? `flex gap-2 ${className}` : "flex gap-2"}>
      <div ref={frontRef} className="min-w-0 flex-1" />
      <div ref={backRef} className="min-w-0 flex-1" />
    </div>
  );
}
