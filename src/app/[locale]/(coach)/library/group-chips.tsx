"use client";

import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";

type Chip = { value: string; label: string; count: number };

/** The cards view's group/category picker: one chip per group with how many
 * rows it holds under the current search and filters. Drives the same value
 * as GroupFilter, which the list view shows instead. Groups with nothing in
 * them are dropped — unless one is the active pick, so it can be un-picked. */
export function GroupChips({
  label,
  allLabel,
  total,
  options,
  value,
  onChange,
}: {
  label: string;
  allLabel: string;
  total: number;
  options: Chip[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const locale = useLocale() as AppLocale;
  const chips = [
    { value: null, label: allLabel, count: total },
    ...options.filter((o) => o.count > 0 || o.value === value),
  ];

  return (
    <div role="group" aria-label={label} className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
      {chips.map((chip) => {
        const active = chip.value === value;
        return (
          <button
            key={chip.value ?? "all"}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(chip.value)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-muted"
            )}
          >
            {chip.label}
            <span className="font-mono text-xs tabular-nums">{formatNumber(chip.count, locale)}</span>
          </button>
        );
      })}
    </div>
  );
}
