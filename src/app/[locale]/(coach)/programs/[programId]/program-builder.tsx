"use client";

import { useState, useTransition } from "react";
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
import { GripVertical, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { ProgramTree } from "@/domain/programs/programs.service";
import {
  deleteProgramAction,
  deleteDayAction,
  deleteItemAction,
  reorderDaysAction,
  reorderItemsAction,
} from "../actions";
import { AddDayDialog } from "./add-day-dialog";
import { ItemDialog } from "./item-dialog";
import { AssignTemplateDialog } from "./assign-template-dialog";
import { useRouter } from "@/i18n/navigation";

type Day = ProgramTree["program_days"][number];
type Item = Day["program_items"][number];

function SortableItem({
  item,
  locale,
  onEdit,
  onDelete,
}: {
  item: Item;
  locale: AppLocale;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("programs.builder");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-md border border-transparent px-3 py-2.5 hover:border-border hover:bg-muted/50 ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="drag"
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{pickLocale(item.exercises, locale)}</div>
        <div className="mt-0.5 flex items-center gap-2 font-mono text-xs text-muted-foreground tabular-nums">
          <span>{t("setsReps", { sets: item.sets, reps: item.reps })}</span>
          {item.rest_seconds != null && <span>· {t("rest", { seconds: item.rest_seconds })}</span>}
        </div>
      </div>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit}>
        <Pencil className="size-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function DayCard({
  locale,
  programId,
  day,
  onEditDay,
  onDeleteDay,
}: {
  locale: AppLocale;
  programId: string;
  day: Day;
  onEditDay: () => void;
  onDeleteDay: () => void;
}) {
  const t = useTranslations("programs.builder");
  const tErrors = useTranslations("programs.errors");
  const [items, setItems] = useState(day.program_items);
  const [itemDialog, setItemDialog] = useState<{ item?: Item } | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = items.findIndex((i) => i.id === active.id);
    const toIndex = items.findIndex((i) => i.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...items];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setItems(reordered);

    startTransition(async () => {
      const result = await reorderItemsAction(
        locale,
        programId,
        day.id,
        reordered.map((i) => i.id)
      );
      if (result?.error) {
        toast.error(tErrors(result.error));
        setItems(day.program_items);
      }
    });
  }

  async function confirmDeleteItem() {
    if (!pendingDeleteItem) return;
    const result = await deleteItemAction(locale, programId, pendingDeleteItem);
    if (result?.error) toast.error(tErrors(result.error));
    setPendingDeleteItem(null);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          {t("dayN", { n: day.day_index })}
          {(day.label_ar || day.label_en) && (
            <span className="font-normal text-muted-foreground">— {pickLocale(day, locale, "label")}</span>
          )}
          <span className="font-mono text-xs text-muted-foreground">({items.length})</span>
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" onClick={() => setItemDialog({})}>
            <Plus className="size-4" />
            {t("addExercise")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" />}>
              <Pencil className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEditDay}>{t("editDay")}</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onDeleteDay}>
                {t("deleteDay")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("noItems")}</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-1">
                {items.map((item) => (
                  <SortableItem
                    key={item.id}
                    item={item}
                    locale={locale}
                    onEdit={() => setItemDialog({ item })}
                    onDelete={() => setPendingDeleteItem(item.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>

      {itemDialog && (
        <ItemDialog
          locale={locale}
          programId={programId}
          dayId={day.id}
          item={itemDialog.item}
          open={!!itemDialog}
          onOpenChange={(open) => !open && setItemDialog(null)}
        />
      )}
      <ConfirmDialog
        open={!!pendingDeleteItem}
        onOpenChange={(open) => !open && setPendingDeleteItem(null)}
        title={t("deleteDay")}
        confirmLabel={t("deleteDay")}
        onConfirm={confirmDeleteItem}
      />
    </Card>
  );
}

export function ProgramBuilder({
  locale,
  tree,
  clients,
  isTemplate,
}: {
  locale: AppLocale;
  tree: ProgramTree;
  clients: { id: string; display_name: string }[];
  isTemplate: boolean;
}) {
  const t = useTranslations("programs.builder");
  const tPrograms = useTranslations("programs");
  const tErrors = useTranslations("programs.errors");
  const router = useRouter();
  const [days, setDays] = useState(tree.program_days);
  const [dayDialog, setDayDialog] = useState<{ day?: Day } | null>(null);
  const [pendingDeleteDay, setPendingDeleteDay] = useState<string | null>(null);
  const [pendingDeleteProgram, setPendingDeleteProgram] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();
  const [, startReorderTransition] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = days.findIndex((d) => d.id === active.id);
    const toIndex = days.findIndex((d) => d.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...days];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setDays(reordered);

    startReorderTransition(async () => {
      const result = await reorderDaysAction(
        locale,
        tree.id,
        reordered.map((d) => d.id)
      );
      if (result?.error) {
        toast.error(tErrors(result.error));
        setDays(tree.program_days);
      }
    });
  }

  async function confirmDeleteDay() {
    if (!pendingDeleteDay) return;
    const result = await deleteDayAction(locale, tree.id, pendingDeleteDay);
    if (result?.error) toast.error(tErrors(result.error));
    setPendingDeleteDay(null);
  }

  function confirmDeleteProgram() {
    startDeleteTransition(async () => {
      const result = await deleteProgramAction(locale, tree.id);
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      router.push("/programs");
    });
  }

  const nextDayIndex = days.length === 0 ? 1 : Math.max(...days.map((d) => d.day_index)) + 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isTemplate && <AssignTemplateDialog locale={locale} programId={tree.id} clients={clients} />}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setDayDialog({})}>
            <Plus className="size-4" />
            {t("addDay")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setPendingDeleteProgram(true)}
          >
            <Trash2 className="size-4" />
            {tPrograms("deleteProgram")}
          </Button>
        </div>
      </div>

      {days.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{t("noDays")}</CardContent>
        </Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={days.map((d) => d.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-4">
              {days.map((day) => (
                <DayCard
                  key={day.id}
                  locale={locale}
                  programId={tree.id}
                  day={day}
                  onEditDay={() => setDayDialog({ day })}
                  onDeleteDay={() => setPendingDeleteDay(day.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {dayDialog && (
        <AddDayDialog
          locale={locale}
          programId={tree.id}
          nextDayIndex={nextDayIndex}
          day={dayDialog.day}
          open={!!dayDialog}
          onOpenChange={(open) => !open && setDayDialog(null)}
        />
      )}
      <ConfirmDialog
        open={!!pendingDeleteDay}
        onOpenChange={(open) => !open && setPendingDeleteDay(null)}
        title={t("confirmDeleteDayTitle")}
        description={t("confirmDeleteDayBody")}
        confirmLabel={t("deleteDay")}
        onConfirm={confirmDeleteDay}
      />
      <ConfirmDialog
        open={pendingDeleteProgram}
        onOpenChange={setPendingDeleteProgram}
        title={tPrograms("confirmDeleteProgramTitle")}
        description={tPrograms("confirmDeleteProgramBody")}
        confirmLabel={tPrograms("deleteProgram")}
        onConfirm={confirmDeleteProgram}
        pending={deletePending}
      />
    </div>
  );
}
