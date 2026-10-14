"use client";

import { useFieldArray } from "react-hook-form";
import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { RecipeFormApi } from "./recipe-form";

/** Numbered steps. The textarea grows with its text (field-sizing-content
 * on Textarea), Ctrl/Cmd+Enter inserts and focuses the next step, and blank
 * rows are dropped by the schema on save. */
export function StepsField({ form }: { form: RecipeFormApi }) {
  const t = useTranslations("recipes.form");
  const tErrors = useTranslations("recipes.errors");
  const { control, register, formState } = form;
  const { fields, append, insert, remove, move } = useFieldArray({ control, name: "steps" });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = fields.findIndex((f) => f.id === active.id);
    const to = fields.findIndex((f) => f.id === over.id);
    if (from !== -1 && to !== -1) move(from, to);
  }

  const rootError = formState.errors.steps?.root?.message ?? formState.errors.steps?.message;

  return (
    <div className="flex flex-col gap-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-2">
            {fields.map((field, index) => {
              const error = formState.errors.steps?.[index]?.text?.message;
              return (
                <StepRow key={field.id} id={field.id}>
                  {(handle) => (
                    <>
                      {handle}
                      <span className="mt-2 w-6 shrink-0 text-center font-mono text-sm font-semibold tabular-nums text-muted-foreground">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <label htmlFor={`step-${field.id}`} className="sr-only">
                          {t("stepN", { n: index + 1 })}
                        </label>
                        <Textarea
                          id={`step-${field.id}`}
                          rows={2}
                          maxLength={500}
                          placeholder={t("stepPlaceholder")}
                          aria-invalid={!!error || undefined}
                          aria-describedby={error ? `step-${field.id}-error` : undefined}
                          {...register(`steps.${index}.text`)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              if (fields.length < 30) insert(index + 1, { text: "" });
                            }
                          }}
                        />
                        {error && (
                          <p id={`step-${field.id}-error`} className="mt-1 text-sm text-destructive">
                            {tErrors.has(error) ? tErrors(error) : tErrors("invalid_input")}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => remove(index)}
                        aria-label={t("removeStep")}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </StepRow>
              );
            })}
          </ol>
        </SortableContext>
      </DndContext>

      {rootError && (
        <p role="alert" className="text-sm text-destructive">
          {tErrors.has(rootError) ? tErrors(rootError) : tErrors("invalid_input")}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ text: "" })}
          disabled={fields.length >= 30}
        >
          <Plus className="size-4" aria-hidden="true" />
          {t("addStep")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("stepsHint")}</p>
      </div>
    </div>
  );
}

function StepRow({ id, children }: { id: string; children: (handle: React.ReactNode) => React.ReactNode }) {
  const t = useTranslations("recipes.form");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-start gap-2", isDragging && "z-10 opacity-70")}
    >
      {children(
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t("dragStep")}
          className="mt-2.5 shrink-0 cursor-grab touch-none rounded text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
      )}
    </li>
  );
}
