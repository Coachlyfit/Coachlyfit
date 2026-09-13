"use client";

import type { ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";

export type KanbanColumn = { key: string; label: string };

// Generic drag-between-columns board. No ordering within a column (that's
// not a requirement here — just which column an item belongs to), so this
// only needs @dnd-kit/core, not the sortable package.
export function KanbanBoard<T extends { id: string }>({
  columns,
  items,
  getGroup,
  isDraggable,
  onMove,
  renderCard,
  emptyLabel,
}: {
  columns: KanbanColumn[];
  items: T[];
  getGroup: (item: T) => string;
  isDraggable: (item: T) => boolean;
  onMove: (item: T, newGroup: string) => void;
  renderCard: (item: T) => ReactNode;
  emptyLabel: string;
}) {
  // A short press-and-hold before a drag starts so a plain vertical/horizontal
  // swipe on mobile scrolls the column/board instead of picking up a card.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const item = items.find((i) => i.id === active.id);
    const newGroup = String(over.id);
    if (item && getGroup(item) !== newGroup) onMove(item, newGroup);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 md:flex-wrap md:snap-none md:overflow-x-visible">
        {columns.map((col) => {
          const columnItems = items.filter((item) => getGroup(item) === col.key);
          return (
            <KanbanColumnDroppable key={col.key} id={col.key} label={col.label} count={columnItems.length}>
              {columnItems.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">{emptyLabel}</p>
              ) : (
                columnItems.map((item) => (
                  <KanbanCardDraggable key={item.id} id={item.id} disabled={!isDraggable(item)}>
                    {renderCard(item)}
                  </KanbanCardDraggable>
                ))
              )}
            </KanbanColumnDroppable>
          );
        })}
      </div>
    </DndContext>
  );
}

function KanbanColumnDroppable({
  id,
  label,
  count,
  children,
}: {
  id: string;
  label: string;
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      className={cn(
        "flex w-[78vw] max-w-72 shrink-0 snap-start flex-col rounded-lg border border-border bg-muted/30 transition-colors sm:w-64 md:w-64",
        isOver && "bg-muted"
      )}
    >
      <div className="flex items-center justify-between px-2 pt-2 text-sm font-medium text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{count}</span>
      </div>
      <div
        ref={setNodeRef}
        className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto overscroll-contain p-2 md:max-h-[65vh]"
      >
        {children}
      </div>
    </div>
  );
}

function KanbanCardDraggable({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(disabled ? {} : { ...listeners, ...attributes })}
      className={cn(
        isDragging && "z-10 opacity-50",
        disabled ? "cursor-default" : "cursor-grab touch-pan-y active:cursor-grabbing"
      )}
    >
      {children}
    </div>
  );
}
