"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FIELD_TYPES, type FieldType } from "@/domain/forms/schema";
import { FIELD_ICONS } from "./field-icons";
import { useBuilderStore } from "./builder-store";

/** `onAdd` fires after adding — the mobile bottom-sheet variant (builder.tsx)
 * uses it to close the sheet, so tapping a field type both adds it and hands
 * off straight to the Inspector sheet, without adding a second control. */
export function FieldPalette({ className, onAdd }: { className?: string; onAdd?: () => void }) {
  const t = useTranslations("forms.builder.fieldTypes");
  const addField = useBuilderStore((s) => s.addField);

  return (
    <div className={cn("flex w-56 shrink-0 flex-col gap-1 border-e border-border p-3", className)}>
      {FIELD_TYPES.map((type: FieldType) => {
        const Icon = FIELD_ICONS[type];
        return (
          <Button
            key={type}
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start gap-2"
            onClick={() => {
              addField(type);
              onAdd?.();
            }}
          >
            <Icon className="size-4" />
            {t(type)}
          </Button>
        );
      })}
    </div>
  );
}
