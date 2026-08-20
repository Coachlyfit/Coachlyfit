"use client";

import { cn } from "@/lib/utils";

/** A 1..N button grid for scale-type answers (mood, energy, adherence, and
 * forms-runtime's dynamic `scale` field). Extracted from
 * step-field-input.tsx's inline `scale` branch so both the coach-built
 * forms wizard and the check-in wizard share one implementation instead of
 * two copies of the same button grid. */
export function ScaleButtons({
  value,
  onChange,
  min,
  max,
}: {
  value: number | undefined;
  onChange: (value: number) => void;
  min: number;
  max: number;
}) {
  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "flex h-13 min-w-13 flex-1 items-center justify-center rounded-[9px] border font-mono text-sm font-semibold transition-colors",
            value === v
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:bg-muted"
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
