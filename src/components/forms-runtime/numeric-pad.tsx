"use client";

import { useLocale } from "next-intl";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "backspace"] as const;

/** Custom keypad for the step flow's `number` fields — the design's case
 * for it is that the system keyboard shows 40 keys for one numeric answer.
 * Writes a `number | undefined` so buildAnswerSchema's z.coerce.number()
 * path is unchanged; empty string clears to undefined rather than 0. */
export function NumericPad({
  value,
  onChange,
  unit,
  integer,
  delta,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  unit?: string;
  integer?: boolean;
  delta?: number;
}) {
  const locale = useLocale() as AppLocale;
  const raw = value === undefined ? "" : String(value);

  function press(key: (typeof KEYS)[number]) {
    if (key === "backspace") {
      const next = raw.slice(0, -1);
      onChange(next === "" || next === "-" ? undefined : Number(next));
      return;
    }
    if (key === "." && (integer || raw.includes("."))) return;
    const next = raw + key;
    // Trailing "." or lone "-" isn't a valid number yet — keep it as text
    // state via the string coercion above until another digit lands; store
    // nothing on those intermediate states so the pad doesn't emit NaN.
    if (next.endsWith(".") || Number.isNaN(Number(next))) return;
    onChange(Number(next));
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-baseline justify-center gap-2.5">
        <span className="font-mono text-6xl font-semibold tracking-tight text-foreground tabular-nums">
          {raw || "0"}
        </span>
        {unit && <span className="text-xl text-muted-foreground">{unit}</span>}
      </div>
      {delta !== undefined && Number.isFinite(delta) && (
        <div
          className={cn(
            "text-sm",
            delta < 0 ? "text-success" : delta > 0 ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {delta > 0 ? "+" : ""}
          {formatNumber(delta, locale, { maximumFractionDigits: 2 })}
          {unit ? ` ${unit}` : ""}
        </div>
      )}
      <div className="grid w-full grid-cols-3 gap-2.5">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            inputMode="none"
            disabled={key === "." && integer}
            onClick={() => press(key)}
            className={cn(
              "flex h-14.5 items-center justify-center rounded-[11px] border border-border bg-background font-mono text-xl font-semibold text-foreground transition-colors",
              "hover:bg-muted disabled:pointer-events-none disabled:opacity-40",
              key === "backspace" && "bg-muted font-sans text-base font-normal text-muted-foreground"
            )}
          >
            {key === "backspace" ? <Delete className="size-5" /> : key}
          </button>
        ))}
      </div>
    </div>
  );
}
