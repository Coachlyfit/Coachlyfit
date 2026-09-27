"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
};

/** Segmented single-choice control (source filter, view switcher). Uses
 * aria-pressed toggles inside a labelled group rather than a radiogroup:
 * these switch a view immediately, they don't stage a form value. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex max-w-full overflow-x-auto no-scrollbar rounded-md border border-border p-0.5", className)}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = value === option.value;
        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn("shrink-0 gap-1.5", active && "bg-muted text-foreground")}
          >
            {Icon && <Icon className="size-4" aria-hidden="true" />}
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
