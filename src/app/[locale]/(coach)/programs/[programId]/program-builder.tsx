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
import {
  GripVertical,
  Plus,
  Trash2,
  Pencil,
  Printer,
  Link2,
  Link2Off,
  Copy,
  HeartPulse,
  Wind,
  StickyNote,
  Salad,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { ProgramTree } from "@/domain/programs/programs.service";
import { projectSetsForWeek, MAX_PROGRAM_WEEKS, type ProgressionRule } from "@/domain/programs/progression";
import {
  deleteProgramAction,
  deleteDayAction,
  deleteItemAction,
  duplicateDayAction,
  duplicateItemAction,
  reorderDaysAction,
  reorderItemsAction,
  groupItemsAction,
  ungroupItemsAction,
  deleteActivityAction,
} from "../actions";
import { AddDayDialog } from "./add-day-dialog";
import { ItemDialog } from "./item-dialog";
import { ActivityDialog } from "./activity-dialog";
import { NutritionPanel } from "./nutrition-panel";
import { RehabPanel } from "./rehab-panel";
import { AssignTemplateDialog } from "./assign-template-dialog";
import { SaveAsTemplateDialog } from "./save-as-template-dialog";
import { RevisionHistoryDrawer } from "./revision-history-drawer";
import { ExerciseSidebar, EXERCISE_DRAG_MIME } from "./exercise-sidebar";
import { VolumeSidebar } from "./volume-sidebar";
import { Link, useRouter } from "@/i18n/navigation";

type Day = ProgramTree["program_days"][number];
type Item = Day["program_items"][number];
type Activity = Day["program_activities"][number];

/** Week 1 is the editable base; week 2-12 is a read-only projection
 * (progression.ts) — no drag handle, no edit/delete, and week>1 never mounts
 * inside a DndContext (see DayCard) so there's nothing to make draggable. */
function SortableItem({
  item,
  locale,
  week,
  groupLabel,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  item: Item;
  locale: AppLocale;
  week: number;
  /** "A1"/"A2"/... when this item is part of a superset/circuit, null
   * otherwise. Purely a display label — group membership itself is
   * item.group_key, this is just its position within the group. */
  groupLabel: string | null;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const t = useTranslations("programs.builder");
  const readOnly = week !== 1;
  const sortable = useSortable({ id: item.id, disabled: readOnly });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  const displaySets = readOnly
    ? projectSetsForWeek(item.program_item_sets, item.progression_rule as ProgressionRule, week)
    : item.program_item_sets;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-3 rounded-md border px-3 py-2.5 hover:bg-muted/50",
        selected ? "border-primary bg-primary/5" : "border-transparent hover:border-border",
        isDragging && "opacity-50"
      )}
    >
      {!readOnly && (
        <>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={t("selectItem")}
            className="size-4 shrink-0 accent-primary"
          />
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label="drag"
            className="-m-1.5 cursor-grab touch-none p-1.5 text-muted-foreground active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </button>
        </>
      )}
      {groupLabel && (
        <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-secondary-foreground">
          {groupLabel}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{pickLocale(item.exercises, locale)}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {displaySets.map((set, i) => (
            <span
              key={i}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground tabular-nums"
            >
              {set.reps}×{set.weight != null ? `${set.weight}kg` : t("bodyweight")}
            </span>
          ))}
        </div>
      </div>
      {!readOnly && (
        <>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit}>
            <Pencil className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onDuplicate} title={t("duplicateItem")}>
            <Copy className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete}>
            <Trash2 className="size-4" />
          </Button>
        </>
      )}
    </div>
  );
}

const CARDIO_ICON_BY_KIND = { cardio: HeartPulse, recovery: Wind } as const;

/** One cardio/recovery activity row — compact, distinct from a workout
 * item's row (no drag handle, no sets grid; just kind icon + modality +
 * the fields that were actually filled in). */
function ActivityRow({
  activity,
  readOnly,
  onEdit,
  onDelete,
}: {
  activity: Activity;
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("programs.activityDialog");
  const Icon = CARDIO_ICON_BY_KIND[activity.kind as "cardio" | "recovery"];
  const parts = [
    t(`modalities.${activity.modality}`),
    activity.duration_min ? `${activity.duration_min} ${t("minShort")}` : null,
    activity.distance_km ? `${activity.distance_km}km` : null,
    activity.intensity ? t(`intensities.${activity.intensity}`) : null,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-2.5 rounded-md border border-transparent px-3 py-2 hover:border-border hover:bg-muted/50">
      <Icon className={cn("size-4 shrink-0", activity.kind === "cardio" ? "text-orange-500" : "text-sky-500")} />
      <div className="min-w-0 flex-1 text-sm">{parts.join(" · ")}</div>
      {!readOnly && (
        <>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit}>
            <Pencil className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete}>
            <Trash2 className="size-4" />
          </Button>
        </>
      )}
    </div>
  );
}

function DayCard({
  locale,
  programId,
  day,
  week,
  rehabPhases,
  dietVariant,
  onEditDay,
  onDeleteDay,
}: {
  locale: AppLocale;
  programId: string;
  day: Day;
  week: number;
  rehabPhases: { id: string; name_ar: string; name_en: string }[];
  /** The variant day.diet_plan_id points at, if any — looked up by the
   * caller (ProgramBuilder has tree.diet_variants, DayCard only has the
   * id) so this component stays a pure prop-in view of its day. */
  dietVariant?: { id: string; name_ar: string; name_en: string; target_kcal: number | null };
  onEditDay: () => void;
  onDeleteDay: () => void;
}) {
  const t = useTranslations("programs.builder");
  const tErrors = useTranslations("programs.errors");
  const router = useRouter();
  const readOnly = week !== 1;
  const [items, setItems] = useState(day.program_items);
  const [activityDialog, setActivityDialog] = useState<{
    activity?: Activity;
    kind?: "cardio" | "recovery";
  } | null>(null);
  const [pendingDeleteActivity, setPendingDeleteActivity] = useState<string | null>(null);
  const [itemDialog, setItemDialog] = useState<{
    item?: Item;
    initialExercise?: { id: string; name_ar: string; name_en: string };
    initialBlock?: "mobility" | "rehab";
  } | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const [groupPending, startGroupTransition] = useTransition();

  const workoutItems = items.filter((i) => i.block === "warmup" || i.block === "main" || i.block === "cooldown");
  const otherItems = items.filter((i) => i.block === "mobility" || i.block === "rehab");

  // Position-within-group label (A1, A2, B1, B2, ...) — a fresh letter per
  // distinct group_key encountered, in item order. Recomputed from `items`
  // on every render rather than stored, since it's pure display derived
  // from group_key + order, same as displaySets' projection above.
  // Grouping only applies to workout items (mobility/rehab render in their
  // own non-sortable section below and were never part of the group UI).
  const groupLabels = new Map<string, string>();
  {
    let letterIndex = 0;
    const letterByGroup = new Map<string, string>();
    for (const item of workoutItems) {
      if (!item.group_key) continue;
      let letter = letterByGroup.get(item.group_key);
      if (!letter) {
        letter = String.fromCharCode(65 + letterIndex);
        letterIndex++;
        letterByGroup.set(item.group_key, letter);
      }
      const position = workoutItems.filter((i) => i.group_key === item.group_key).indexOf(item) + 1;
      groupLabels.set(item.id, `${letter}${position}`);
    }
  }

  function toggleSelect(itemId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function makeGroup(kind: "superset" | "circuit") {
    const ids = Array.from(selected);
    if (ids.length < 2) return;
    startGroupTransition(async () => {
      const result = await groupItemsAction(locale, programId, ids, kind);
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  function ungroupSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    startGroupTransition(async () => {
      const result = await ungroupItemsAction(locale, programId, ids);
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const raw = e.dataTransfer.getData(EXERCISE_DRAG_MIME);
    if (!raw) return;
    try {
      setItemDialog({ initialExercise: JSON.parse(raw) });
    } catch {
      // Malformed payload (not our drag source) — ignore silently.
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Drag/reorder is scoped to workout items only (mobility/rehab render in
  // their own static section, see workoutItems/otherItems above) — the
  // reordered array sent to the server is just the workout subset's new
  // order, which reorderItems applies as order_index 0..N regardless of
  // what other blocks share the day; mobility/rehab items keep whatever
  // order_index they already had.
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = workoutItems.findIndex((i) => i.id === active.id);
    const toIndex = workoutItems.findIndex((i) => i.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;

    const reorderedWorkout = [...workoutItems];
    const [moved] = reorderedWorkout.splice(fromIndex, 1);
    reorderedWorkout.splice(toIndex, 0, moved);

    const previous = items;
    setItems([...reorderedWorkout, ...otherItems]);

    startTransition(async () => {
      const result = await reorderItemsAction(
        locale,
        programId,
        day.id,
        reorderedWorkout.map((i) => i.id)
      );
      if (result?.error) {
        toast.error(tErrors(result.error));
        // Revert to the pre-drag snapshot, not the (now-stale) day.program_items
        // prop — this component never remounts on a server refresh, so that
        // prop stays frozen at whatever it was on first render.
        setItems(previous);
        router.refresh();
      }
    });
  }

  async function confirmDeleteItem() {
    if (!pendingDeleteItem) return;
    const result = await deleteItemAction(locale, programId, pendingDeleteItem);
    if (result?.error) toast.error(tErrors(result.error));
    setPendingDeleteItem(null);
  }

  async function duplicateItem(itemId: string) {
    const result = await duplicateItemAction(locale, programId, itemId);
    if (result?.error) toast.error(tErrors(result.error));
    else router.refresh();
  }

  async function duplicateDay() {
    const result = await duplicateDayAction(locale, programId, day.id);
    if (result?.error) toast.error(tErrors(result.error));
    else router.refresh();
  }

  async function confirmDeleteActivity() {
    if (!pendingDeleteActivity) return;
    const result = await deleteActivityAction(locale, programId, pendingDeleteActivity);
    if (result?.error) toast.error(tErrors(result.error));
    setPendingDeleteActivity(null);
  }

  const hasNote = !!(day.notes_ar || day.notes_en);

  return (
    <Card
      onDragOver={readOnly ? undefined : (e) => e.preventDefault()}
      onDragEnter={readOnly ? undefined : () => setDragOver(true)}
      onDragLeave={readOnly ? undefined : () => setDragOver(false)}
      onDrop={readOnly ? undefined : handleDrop}
      className={dragOver ? "ring-2 ring-primary" : undefined}
    >
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-base">
          {t("dayN", { n: day.day_index })}
          {(day.label_ar || day.label_en) && (
            <span className="font-normal text-muted-foreground">— {pickLocale(day, locale, "label")}</span>
          )}
          {day.weekday != null && (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
              {t(`weekdayShort.${day.weekday}`)}
            </span>
          )}
          <span className="font-mono text-xs text-muted-foreground">({items.length})</span>
          {dietVariant && (
            <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              <Salad className="size-3" />
              {pickLocale(dietVariant, locale)}
              {dietVariant.target_kcal != null && ` · ${dietVariant.target_kcal}${t("kcalShort")}`}
            </span>
          )}
        </CardTitle>
        <div className="flex shrink-0 items-center gap-1">
          {!readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
                <Plus className="size-4" />
                {t("add")}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setItemDialog({})}>{t("addExercise")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setItemDialog({ initialBlock: "mobility" })}>
                  {t("addMobility")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setItemDialog({ initialBlock: "rehab" })}>
                  {t("addRehab")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActivityDialog({ kind: "cardio" })}>
                  {t("addCardio")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActivityDialog({ kind: "recovery" })}>
                  {t("addRecovery")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" />}>
              <Pencil className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEditDay}>{t("editDay")}</DropdownMenuItem>
              <DropdownMenuItem onClick={duplicateDay}>{t("duplicateDay")}</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onDeleteDay}>
                {t("deleteDay")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      {!readOnly && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 sm:px-6">
          <span className="text-xs text-muted-foreground">{t("selectedCount", { count: selected.size })}</span>
          {selected.size >= 2 && (
            <>
              <Button type="button" variant="outline" size="sm" disabled={groupPending} onClick={() => makeGroup("superset")}>
                <Link2 className="size-4" />
                {t("makeSuperset")}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={groupPending} onClick={() => makeGroup("circuit")}>
                <Link2 className="size-4" />
                {t("makeCircuit")}
              </Button>
            </>
          )}
          <Button type="button" variant="ghost" size="sm" disabled={groupPending} onClick={ungroupSelected}>
            <Link2Off className="size-4" />
            {t("ungroup")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            {t("clearSelection")}
          </Button>
        </div>
      )}
      <CardContent className="flex flex-col gap-4">
        {items.length === 0 && day.program_activities.length === 0 && !hasNote ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("noItems")}</p>
        ) : (
          <>
            {workoutItems.length > 0 &&
              (readOnly ? (
                <div className="flex flex-col gap-1">
                  {workoutItems.map((item) => (
                    <SortableItem
                      key={item.id}
                      item={item}
                      locale={locale}
                      week={week}
                      groupLabel={groupLabels.get(item.id) ?? null}
                      selected={false}
                      onToggleSelect={() => {}}
                      onEdit={() => {}}
                      onDelete={() => {}}
                      onDuplicate={() => {}}
                    />
                  ))}
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={workoutItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-1">
                      {workoutItems.map((item) => (
                        <SortableItem
                          key={item.id}
                          item={item}
                          locale={locale}
                          week={week}
                          groupLabel={groupLabels.get(item.id) ?? null}
                          selected={selected.has(item.id)}
                          onToggleSelect={() => toggleSelect(item.id)}
                          onEdit={() => setItemDialog({ item })}
                          onDelete={() => setPendingDeleteItem(item.id)}
                          onDuplicate={() => duplicateItem(item.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ))}

            {otherItems.length > 0 && (
              <div className="flex flex-col gap-1 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">{t("mobilityRehab")}</p>
                {otherItems.map((item) => (
                  <SortableItem
                    key={item.id}
                    item={item}
                    locale={locale}
                    week={week}
                    groupLabel={null}
                    selected={false}
                    onToggleSelect={() => {}}
                    onEdit={() => setItemDialog({ item })}
                    onDelete={() => setPendingDeleteItem(item.id)}
                    onDuplicate={() => duplicateItem(item.id)}
                  />
                ))}
              </div>
            )}

            {day.program_activities.length > 0 && (
              <div className="flex flex-col gap-1 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">{t("activities")}</p>
                {day.program_activities.map((activity) => (
                  <ActivityRow
                    key={activity.id}
                    activity={activity}
                    readOnly={readOnly}
                    onEdit={() => setActivityDialog({ activity })}
                    onDelete={() => setPendingDeleteActivity(activity.id)}
                  />
                ))}
              </div>
            )}

            {hasNote && (
              <div className="flex items-start gap-2 border-t border-border pt-3 text-sm">
                <StickyNote className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p className="text-muted-foreground">{pickLocale(day, locale, "notes")}</p>
              </div>
            )}
          </>
        )}
      </CardContent>

      {itemDialog && (
        <ItemDialog
          locale={locale}
          programId={programId}
          dayId={day.id}
          item={itemDialog.item}
          initialExercise={itemDialog.initialExercise}
          initialBlock={itemDialog.initialBlock}
          rehabPhases={rehabPhases}
          open={!!itemDialog}
          onOpenChange={(open) => !open && setItemDialog(null)}
        />
      )}
      {activityDialog && (
        <ActivityDialog
          locale={locale}
          programId={programId}
          dayId={day.id}
          activity={activityDialog.activity}
          defaultKind={activityDialog.kind}
          open={!!activityDialog}
          onOpenChange={(open) => !open && setActivityDialog(null)}
        />
      )}
      <ConfirmDialog
        open={!!pendingDeleteItem}
        onOpenChange={(open) => !open && setPendingDeleteItem(null)}
        title={t("deleteDay")}
        confirmLabel={t("deleteDay")}
        onConfirm={confirmDeleteItem}
      />
      <ConfirmDialog
        open={!!pendingDeleteActivity}
        onOpenChange={(open) => !open && setPendingDeleteActivity(null)}
        title={t("deleteActivity")}
        confirmLabel={t("deleteActivity")}
        onConfirm={confirmDeleteActivity}
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
  const tPrint = useTranslations("print");
  const tErrors = useTranslations("programs.errors");
  const router = useRouter();
  const [days, setDays] = useState(tree.program_days);
  const [week, setWeek] = useState(1);
  const readOnly = week !== 1;
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

    const previous = days;
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
        setDays(previous);
        router.refresh();
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
  const rehabPhases = tree.rehab_protocols.flatMap((p) => p.rehab_phases);
  const [sidebarTab, setSidebarTab] = useState<"exercises" | "nutrition" | "rehab">("exercises");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {isTemplate && <AssignTemplateDialog locale={locale} programId={tree.id} clients={clients} />}
          {!isTemplate && <RevisionHistoryDrawer locale={locale} programId={tree.id} />}
          {!isTemplate && (
            <SaveAsTemplateDialog locale={locale} programId={tree.id} nameAr={tree.name_ar} nameEn={tree.name_en} />
          )}
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <select
              value={week}
              onChange={(e) => setWeek(Number(e.target.value))}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-base md:text-sm"
            >
              {Array.from({ length: MAX_PROGRAM_WEEKS }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>
                  {t("week", { n: w })}
                </option>
              ))}
            </select>
          </label>
          {readOnly && <span className="text-xs text-muted-foreground">{t("weekReadOnlyHint")}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/print/program/${tree.id}`}
            target="_blank"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <Printer className="size-4" />
            {tPrint("button")}
          </Link>
          {!readOnly && (
            <Button type="button" variant="outline" onClick={() => setDayDialog({})}>
              <Plus className="size-4" />
              {t("addDay")}
            </Button>
          )}
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

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          {days.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">{t("noDays")}</CardContent>
            </Card>
          ) : readOnly ? (
            <div className="flex flex-col gap-4">
              {days.map((day) => (
                <DayCard
                  key={day.id}
                  locale={locale}
                  programId={tree.id}
                  day={day}
                  week={week}
                  rehabPhases={rehabPhases}
                  dietVariant={tree.diet_variants.find((v) => v.id === day.diet_plan_id)}
                  onEditDay={() => setDayDialog({ day })}
                  onDeleteDay={() => setPendingDeleteDay(day.id)}
                />
              ))}
            </div>
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
                      week={week}
                      rehabPhases={rehabPhases}
                      dietVariant={tree.diet_variants.find((v) => v.id === day.diet_plan_id)}
                      onEditDay={() => setDayDialog({ day })}
                      onDeleteDay={() => setPendingDeleteDay(day.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
        <aside className="flex flex-col gap-4">
          {!readOnly && (
            <div className="flex gap-1 rounded-lg border border-border p-1">
              {(["exercises", "nutrition", "rehab"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSidebarTab(tab)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1.5 text-xs font-medium",
                    sidebarTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {t(`sidebarTab.${tab}`)}
                </button>
              ))}
            </div>
          )}
          {!readOnly && sidebarTab === "exercises" && <ExerciseSidebar locale={locale} programId={tree.id} days={days} />}
          {!readOnly && sidebarTab === "nutrition" && (
            <NutritionPanel locale={locale} programId={tree.id} days={days} variants={tree.diet_variants} />
          )}
          {!readOnly && sidebarTab === "rehab" && (
            <RehabPanel
              locale={locale}
              programId={tree.id}
              programStartDate={tree.start_date}
              protocols={tree.rehab_protocols}
            />
          )}
          <VolumeSidebar days={days} />
        </aside>
      </div>

      {dayDialog && (
        <AddDayDialog
          locale={locale}
          programId={tree.id}
          nextDayIndex={nextDayIndex}
          day={dayDialog.day}
          scheduleMode={tree.schedule_mode as "cycle" | "weekly"}
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
