"use client";

import { useTranslations } from "next-intl";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FormField } from "@/domain/forms/schema";
import { FIELD_ICONS } from "./field-icons";
import { useBuilderStore } from "./builder-store";

function SortableRow({ field }: { field: FormField }) {
  const t = useTranslations("forms.builder.fieldTypes");
  const selectedId = useBuilderStore((s) => s.selectedId);
  const select = useBuilderStore((s) => s.select);
  const removeField = useBuilderStore((s) => s.removeField);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });

  const Icon = FIELD_ICONS[field.type];
  const isSection = field.type === "section";
  const label = field.label.ar || field.label.en || t(field.type);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={() => select(field.id)}
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer",
        selectedId === field.id ? "border-primary bg-primary/5" : "border-border",
        isDragging && "opacity-50",
        isSection && "font-semibold"
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="drag"
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="size-4" />
      </button>
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate text-sm">{label}</span>
      {field.required && <span className="text-xs text-destructive">*</span>}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={(e) => {
          e.stopPropagation();
          removeField(field.id);
        }}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

export function Canvas() {
  const t = useTranslations("forms.builder");
  const fields = useBuilderStore((s) => s.fields);
  const reorder = useBuilderStore((s) => s.reorder);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = fields.findIndex((f) => f.id === active.id);
    const toIndex = fields.findIndex((f) => f.id === over.id);
    if (fromIndex !== -1 && toIndex !== -1) reorder(fromIndex, toIndex);
  }

  if (fields.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
        {t("canvasEmpty")}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {fields.map((field) => (
              <SortableRow key={field.id} field={field} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
