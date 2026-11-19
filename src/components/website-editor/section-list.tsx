"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { LOCKED_SECTIONS, type SectionKey, type SiteSection } from "@/domain/sites/site-content";
import { cn } from "@/lib/utils";

const isLocked = (key: SectionKey) => LOCKED_SECTIONS.includes(key);

type RowProps = {
  section: SiteSection;
  summary: string;
  /** false: nothing to edit in this panel (the section is managed elsewhere). */
  editable: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
};

function RowShell({ section, summary, editable, onToggle, onEdit, handle }: RowProps & { handle: React.ReactNode }) {
  const t = useTranslations("websiteEditor.sections");
  const name = t(`names.${section.key}`);
  const locked = isLocked(section.key);

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl bg-card p-2 ps-1 ring-1 ring-foreground/10",
        !section.enabled && "opacity-70"
      )}
    >
      {handle}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{name}</span>
        <span className="truncate text-sm text-muted-foreground">{locked ? t("alwaysOn") : summary}</span>
      </div>
      {locked ? (
        <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : (
        <Switch
          checked={section.enabled}
          onCheckedChange={onToggle}
          aria-label={t("toggle", { name })}
          className="data-[size=default]:h-6 data-[size=default]:w-10"
        />
      )}
      {editable && (
        <Button type="button" variant="outline" size="sm" onClick={onEdit} className="min-h-11">
          {t("edit")}
        </Button>
      )}
    </div>
  );
}

function LockedRow(props: RowProps) {
  return (
    <RowShell
      {...props}
      handle={
        // Same footprint as the drag handle so the names line up.
        <span className="flex size-11 shrink-0 items-center justify-center text-muted-foreground/40" aria-hidden="true">
          <GripVertical className="size-4" />
        </span>
      }
    />
  );
}

function SortableRow({
  index,
  total,
  onMove,
  ...props
}: RowProps & { index: number; total: number; onMove: (to: number) => void }) {
  const t = useTranslations("websiteEditor.sections");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.section.key });
  const name = t(`names.${props.section.key}`);

  // Arrow keys move the focused row without a pick-up step: faster than the
  // drag library's Space-to-lift flow and obvious to a screen-reader user.
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowUp" && index > 0) {
      e.preventDefault();
      onMove(index - 1);
    } else if (e.key === "ArrowDown" && index < total - 1) {
      e.preventDefault();
      onMove(index + 1);
    }
  }

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "z-10 opacity-60")}>
      <RowShell
        {...props}
        handle={
          <button
            type="button"
            {...attributes}
            {...listeners}
            data-handle={props.section.key}
            onKeyDown={onKeyDown}
            aria-label={t("drag", { name })}
            aria-describedby="website-sections-help"
            className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </button>
        }
      />
    </li>
  );
}

/** Sections in saved order. Hero is pinned first and Footer last (locked,
 * always on); the middle seven reorder by pointer drag or ↑/↓ on the handle. */
export function SectionList({
  sections,
  summaries,
  onReorder,
  onToggle,
  onEdit,
  canEdit = () => true,
}: {
  sections: SiteSection[];
  summaries: Record<SectionKey, string>;
  canEdit?: (key: SectionKey) => boolean;
  onReorder: (sections: SiteSection[]) => void;
  onToggle: (key: SectionKey, enabled: boolean) => void;
  onEdit: (key: SectionKey) => void;
}) {
  const t = useTranslations("websiteEditor.sections");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [announcement, setAnnouncement] = useState("");
  const focusKey = useRef<SectionKey | null>(null);

  const hero = sections[0];
  const footer = sections[sections.length - 1];
  const middle = sections.slice(1, -1);

  // Reordering moves DOM nodes, which can drop focus; put it back on the
  // handle that was just used.
  useLayoutEffect(() => {
    if (!focusKey.current) return;
    document.querySelector<HTMLElement>(`[data-handle="${focusKey.current}"]`)?.focus();
    focusKey.current = null;
  }, [sections]);

  function move(from: number, to: number) {
    const next = arrayMove(middle, from, to);
    focusKey.current = middle[from].key;
    setAnnouncement(
      t("moved", { name: t(`names.${middle[from].key}`), position: to + 1, total: middle.length })
    );
    onReorder([hero, ...next, footer]);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = middle.findIndex((s) => s.key === active.id);
    const to = middle.findIndex((s) => s.key === over.id);
    if (from !== -1 && to !== -1) move(from, to);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      <p id="website-sections-help" className="sr-only">
        {t("dragHelp")}
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <LockedRow
        section={hero}
        summary={summaries[hero.key]}
        editable={canEdit(hero.key)}
        onToggle={() => {}}
        onEdit={() => onEdit(hero.key)}
      />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={middle.map((s) => s.key)} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-2">
            {middle.map((section, i) => (
              <SortableRow
                key={section.key}
                section={section}
                summary={summaries[section.key]}
                editable={canEdit(section.key)}
                index={i}
                total={middle.length}
                onMove={(to) => move(i, to)}
                onToggle={(enabled) => onToggle(section.key, enabled)}
                onEdit={() => onEdit(section.key)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      <LockedRow
        section={footer}
        summary={summaries[footer.key]}
        editable={canEdit(footer.key)}
        onToggle={() => {}}
        onEdit={() => onEdit(footer.key)}
      />
    </div>
  );
}
