"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EyeOff, GripVertical, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SECTION_TYPES, type Section, type SectionType } from "@/domain/marketing/sections.schema";

function Row({
  section,
  index,
  selected,
  onSelect,
}: {
  section: Section;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("admin.site");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-stretch rounded-[10px]",
        selected && "bg-accent-tint font-medium text-accent-tint-foreground",
        isDragging && "opacity-50"
      )}
    >
      {/* The handle is the drag target for the pointer and the keyboard
          (Space to lift, arrows to move, Space to drop). */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t("list.drag", { name: t(`types.${section.type}`) })}
        className="flex min-h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-[10px] text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-[10px] pe-2.5 text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
        <span className="min-w-0 flex-1 truncate">{t(`types.${section.type}`)}</span>
        {!section.is_visible && (
          <>
            <EyeOff className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">{t("list.hidden")}</span>
          </>
        )}
      </button>
    </li>
  );
}

export function SectionList({
  sections,
  selectedId,
  adding,
  onSelect,
  onReorder,
  onAdd,
}: {
  sections: Section[];
  selectedId: string | null;
  adding: boolean;
  onSelect: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onAdd: (type: SectionType) => void;
}) {
  const t = useTranslations("admin.site");
  const [picking, setPicking] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ids = sections.map((s) => s.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from !== -1 && to !== -1) onReorder(arrayMove(ids, from, to));
  }

  return (
    <aside
      aria-label={t("list.title")}
      className="flex shrink-0 flex-col gap-1.5 border-border bg-card px-3 py-4 lg:w-56 lg:overflow-y-auto lg:border-e"
    >
      <h2 className="px-2 pb-1 text-xs font-semibold text-muted-foreground">{t("list.title")}</h2>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-1.5">
            {sections.map((section, i) => (
              <Row
                key={section.id}
                section={section}
                index={i}
                selected={section.id === selectedId}
                onSelect={() => onSelect(section.id)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        disabled={adding}
        onClick={() => setPicking(true)}
        className="mt-1.5 flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-muted-foreground/40 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
      >
        <Plus className="size-4" aria-hidden="true" />
        {t("list.add")}
      </button>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("list.pickType")}</DialogTitle>
          </DialogHeader>
          <ul className="grid gap-2 sm:grid-cols-2">
            {SECTION_TYPES.map((type) => (
              <li key={type}>
                <button
                  type="button"
                  onClick={() => {
                    setPicking(false);
                    onAdd(type);
                  }}
                  className="flex min-h-11 w-full items-center rounded-[10px] px-3 text-start ring-1 ring-border outline-none ring-inset hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {t(`types.${type}`)}
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
