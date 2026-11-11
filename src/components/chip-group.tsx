"use client";

import { cn } from "@/lib/utils";

/** Single-select pill chips. With `allowDeselect`, clicking the selected chip
 * clears the value (null) -- for optional choices like severity. */
export function ChipGroup<T extends string>({
  value,
  onChange,
  options,
  label,
  allowDeselect = false,
  disabled,
}: {
  value: T | null;
  onChange: (value: T | null) => void;
  options: readonly { value: T; label: string }[];
  label: string;
  allowDeselect?: boolean;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(active && allowDeselect ? null : option.value)}
            className={cn(
              "rounded-full px-3 py-1 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
              active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
