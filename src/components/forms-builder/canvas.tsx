"use client";

import { useLocale, useTranslations } from "next-intl";
import { FormProvider, useForm } from "react-hook-form";
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
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldInput } from "@/components/forms-runtime/field-input";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { pickBilingual, type AppLocale } from "@/domain/locale";
import type { FormField } from "@/domain/forms/schema";
import { useBuilderStore } from "./builder-store";

/** One question, drawn the way the client gets it. `number` is null for a
 * section heading (a heading isn't a question). `isFirst`/`isLast` disable
 * the move buttons at the ends. */
function QuestionCard({
  field,
  number,
  isFirst,
  isLast,
}: {
  field: FormField;
  number: number | null;
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useTranslations("forms.builder");
  const locale = useLocale() as AppLocale;
  const selected = useBuilderStore((s) => s.selectedId === field.id);
  const select = useBuilderStore((s) => s.select);
  const removeField = useBuilderStore((s) => s.removeField);
  const moveField = useBuilderStore((s) => s.moveField);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });

  const isSection = field.type === "section";
  const label = pickBilingual(field.label, locale);
  const help = field.help ? pickBilingual(field.help, locale) : "";
  // The card's own onClick selects; without this an action would select the
  // card again right after (for delete: a field that no longer exists).
  const act = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={() => select(field.id)}
      className={cn(
        "flex cursor-pointer flex-col gap-2.5 rounded-xl p-3.5 ring-1 ring-border ring-inset",
        selected && "bg-accent-tint/40 ring-2 ring-primary",
        isDragging && "opacity-50"
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t("drag")}
          className="mt-0.5 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="size-4" />
        </button>
        {number != null && (
          <span className="min-w-5 font-mono font-semibold text-muted-foreground tabular-nums">
            {formatNumber(number, locale)}
          </span>
        )}
        {/* A real button so the card can be selected from the keyboard; the
            move/delete buttons it reveals come right after it in tab order. */}
        <button
          type="button"
          aria-pressed={selected}
          className="flex min-w-0 flex-1 flex-col rounded-sm text-start leading-snug outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className={cn("font-semibold", isSection && "text-base", !label && "text-muted-foreground")}>
            {label || t("untitled")}
            {field.required && <span className="text-destructive"> *</span>}
          </span>
          {help && <span className="text-muted-foreground">{help}</span>}
        </button>
        {selected && (
          <span className="flex shrink-0 gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t("moveUp")}
              disabled={isFirst}
              onClick={act(() => moveField(field.id, -1))}
            >
              <ChevronUp className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t("moveDown")}
              disabled={isLast}
              onClick={act(() => moveField(field.id, 1))}
            >
              <ChevronDown className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t("deleteQuestion")}
              className="text-destructive hover:text-destructive"
              onClick={act(() => removeField(field.id))}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </span>
        )}
      </div>
      {!isSection && (
        // The real client input, as a picture: inert keeps it out of the tab
        // order and lets a click anywhere on it select the card instead.
        <div inert className="pointer-events-none ps-13">
          <FieldInput field={field} />
        </div>
      )}
    </div>
  );
}

export function Canvas({ title, className }: { title: string; className?: string }) {
  const t = useTranslations("forms.builder");
  const fields = useBuilderStore((s) => s.fields);
  const reorder = useBuilderStore((s) => s.reorder);
  const addField = useBuilderStore((s) => s.addField);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  // FieldInput reads a react-hook-form context; nothing is ever submitted.
  const methods = useForm();

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = fields.findIndex((f) => f.id === active.id);
    const toIndex = fields.findIndex((f) => f.id === over.id);
    if (fromIndex !== -1 && toIndex !== -1) reorder(fromIndex, toIndex);
  }

  const numbers = new Map(fields.filter((f) => f.type !== "section").map((f, i) => [f.id, i + 1]));

  return (
    <section aria-label={t("questions")} className={cn("flex min-w-0 flex-1 justify-center", className)}>
      <div className="flex w-full max-w-160 flex-col gap-3 rounded-[18px] bg-card p-6 ring-1 ring-foreground/10">
        <div className="border-b border-border pb-2 text-xl font-semibold">{title}</div>

        {fields.length === 0 ? (
          <div className="flex flex-col gap-1 rounded-xl border-[1.5px] border-dashed border-muted-foreground/40 px-4 py-10 text-center">
            <span className="font-semibold">{t("canvasEmptyTitle")}</span>
            <span className="text-muted-foreground">{t("canvasEmpty")}</span>
          </div>
        ) : (
          <FormProvider {...methods}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                {fields.map((field, i) => (
                  <QuestionCard
                    key={field.id}
                    field={field}
                    number={numbers.get(field.id) ?? null}
                    isFirst={i === 0}
                    isLast={i === fields.length - 1}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </FormProvider>
        )}

        <button
          type="button"
          onClick={() => addField("text")}
          className="flex h-12 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-muted-foreground/40 font-medium outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Plus className="size-4" aria-hidden="true" />
          {t("addQuestion")}
        </button>
      </div>
    </section>
  );
}
