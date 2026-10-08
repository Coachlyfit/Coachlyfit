"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { FieldType } from "@/domain/forms/schema";
import { FIELD_ICONS } from "./field-icons";
import { useBuilderStore } from "./builder-store";

const GROUPS = [
  { key: "text", types: ["text", "textarea", "number"] },
  { key: "choice", types: ["radio", "multiselect", "select", "checkbox"] },
  { key: "other", types: ["date", "scale", "photo", "file", "section", "exercise_ref", "food_ref"] },
] as const satisfies readonly { key: string; types: readonly FieldType[] }[];

/** Click adds the type at the end of the form and selects it. `onAdd` fires
 * after adding -- the mobile bottom sheet (builder.tsx) uses it to hand off
 * to the edit sheet. `gridClassName` sets the tile columns: two beside the
 * canvas, three in the sheet. */
export function FieldPalette({
  className,
  gridClassName = "grid-cols-2",
  onAdd,
}: {
  className?: string;
  gridClassName?: string;
  onAdd?: () => void;
}) {
  const t = useTranslations("forms.builder");
  const addField = useBuilderStore((s) => s.addField);

  return (
    <div className={cn("flex flex-col gap-3.5", className)}>
      {GROUPS.map((group) => (
        <div key={group.key} className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">{t(`groups.${group.key}`)}</span>
          <div className={cn("grid gap-1.5", gridClassName)}>
            {group.types.map((type) => {
              const Icon = FIELD_ICONS[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    addField(type);
                    onAdd?.();
                  }}
                  className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-[10px] border border-border bg-card p-1.5 leading-tight outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Icon className="size-4.5 text-primary" aria-hidden="true" />
                  <span className="text-center text-[0.8125rem]">{t(`fieldTypes.${type}`)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
