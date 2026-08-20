"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { FIELD_TYPES, type FieldType } from "@/domain/forms/schema";
import { FIELD_ICONS } from "./field-icons";
import { useBuilderStore } from "./builder-store";

export function FieldPalette() {
  const t = useTranslations("forms.builder.fieldTypes");
  const addField = useBuilderStore((s) => s.addField);

  return (
    <div className="flex w-56 shrink-0 flex-col gap-1 border-e border-border p-3">
      {FIELD_TYPES.map((type: FieldType) => {
        const Icon = FIELD_ICONS[type];
        return (
          <Button
            key={type}
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start gap-2"
            onClick={() => addField(type)}
          >
            <Icon className="size-4" />
            {t(type)}
          </Button>
        );
      })}
    </div>
  );
}
