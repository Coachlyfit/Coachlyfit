"use client";

import type { ReactNode } from "react";
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
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
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const item = items.find((i) => i.id === active.id);
    const newGroup = String(over.id);
    if (item && getGroup(item) !== newGroup) onMove(item, newGroup);
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
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
      ref={setNodeRef}
      className={cn(
        "flex w-64 shrink-0 flex-col gap-2 rounded-lg border border-border bg-muted/30 p-2 transition-colors",
        isOver && "bg-muted"
      )}
    >
      <div className="flex items-center justify-between px-1 text-sm font-medium text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{count}</span>
      </div>
      {children}
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
        "touch-none",
        isDragging && "z-10 opacity-50",
        disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing"
      )}
    >
      {children}
    </div>
  );
}
