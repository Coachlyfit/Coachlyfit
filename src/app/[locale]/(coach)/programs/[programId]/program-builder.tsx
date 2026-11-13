"use client";

import { createContext, useContext, useState, useTransition } from "react";
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
  ChevronUp,
  ChevronDown,
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
  moveVisibleSection,
  normalizeSectionOrder,
  reorderVisibleSections,
  type DaySectionKey,
} from "@/domain/programs/day-sections";
import {
  deleteProgramAction,
  deleteDayAction,
  deleteItemAction,
  duplicateDayAction,
  duplicateItemAction,
  reorderDaysAction,
  reorderItemsAction,
  reorderSectionsAction,
  groupItemsAction,
  setGroupFormatAction,
  ungroupItemsAction,
  deleteActivityAction,
} from "../actions";
import { AddDayDialog } from "./add-day-dialog";
import { ItemDialog } from "./item-dialog";
import { GroupFormatDialog } from "./group-format-dialog";
import { WeekPlanDialog } from "./week-plan-dialog";
import { primaryDays, sessionsOf } from "@/domain/programs/day-sessions";
import { isDeloadWeek, modifierForWeek, parseWeekPlan, type WeekPlan } from "@/domain/programs/week-plan";
import {
  asGroupKind,
  defaultGroupConfig,
  formatGroupConfig,
  parseGroupConfig,
  type GroupConfig,
  type GroupKind,
} from "@/domain/programs/group-config";
import { ActivityDialog } from "./activity-dialog";
import { NutritionPanel } from "./nutrition-panel";
import { RehabPanel } from "./rehab-panel";
import { AssignTemplateDialog } from "./assign-template-dialog";
import { SaveAsTemplateDialog } from "./save-as-template-dialog";
import { RevisionHistoryDrawer } from "./revision-history-drawer";
import { ExerciseSidebar, EXERCISE_DRAG_MIME } from "./exercise-sidebar";
import type { PickedExercise } from "./exercise-media";
import { formatSetMeasures, measuresFromRow, targetTags } from "@/domain/workouts/set-measures";
import { VolumeSidebar } from "./volume-sidebar";
import { Link, useRouter } from "@/i18n/navigation";

type Day = ProgramTree["program_days"][number];
type Item = Day["program_items"][number];
type Activity = Day["program_activities"][number];

/** The program's authored week plan, for the week-N projection each row shows.
 * A context rather than a prop: it is read two components down (DayCard ->
 * SortableItem) and never changes while the builder is mounted. */
const WeekPlanContext = createContext<WeekPlan | null>(null);

/** Week 1 is the editable base; week 2-12 is a read-only projection
 * (progression.ts) — no drag handle, no edit/delete, and week>1 never mounts
 * inside a DndContext (see DayCard) so there's nothing to make draggable. */
function SortableItem({
  item,
  locale,
  week,
  groupLabel,
  groupBadge,
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
  /** Format chip ("AMRAP 12:00", "Giant set") shown on a group's first
   * member; clicking edits the whole group's format. Null on every other row
   * and for plain superset/circuit groups. */
  groupBadge: { text: string; onEdit: () => void } | null;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const t = useTranslations("programs.builder");
  const tm = useTranslations("measure");
  const readOnly = week !== 1;
  const weekPlan = useContext(WeekPlanContext);
  const sortable = useSortable({ id: item.id, disabled: readOnly });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  const displaySets = readOnly
    ? projectSetsForWeek(item.program_item_sets, item.progression_rule as ProgressionRule, week, weekPlan)
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
      {groupBadge && (
        <button
          type="button"
          onClick={groupBadge.onEdit}
          disabled={readOnly}
          className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary enabled:hover:bg-primary/20"
        >
          {groupBadge.text}
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{pickLocale(item.exercises, locale)}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {displaySets.map((set, i) => {
            const tags = targetTags(set, tm);
            return (
              <span
                key={i}
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground tabular-nums"
              >
                {formatSetMeasures(item.exercises.measurement_type, item.block, measuresFromRow(set), tm)}
                {tags.length > 0 && <span className="text-foreground/70"> · {tags.join(" · ")}</span>}
              </span>
            );
          })}
        </div>
        {(item.tempo || item.per_side || item.scaled_notes_en || item.scaled_notes_ar) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {item.tempo && <span className="font-mono">{tm("tempoValue", { value: item.tempo })}</span>}
            {item.per_side && <span>{tm("perSide")}</span>}
            {(item.scaled_notes_en || item.scaled_notes_ar) && <span>{tm("hasScaled")}</span>}
          </div>
        )}
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

/** One reorderable day section (workout / mobility & rehab / activities).
 * Same @dnd-kit sortable pattern as SortableItem above, but the drag handle
 * lives on the section header instead of each row. Up/down buttons are the
 * non-drag fallback for touch and keyboard users; both paths go through the
 * same persist callback on DayCard. */
function SortableSection({
  id,
  title,
  first,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  children,
}: {
  id: DaySectionKey;
  /** null for the unnamed main workout section — it still gets a handle and
   * buttons, so it is not pinned above the others. */
  title: string | null;
  first: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("programs.builder");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const sectionName = title ?? t("sectionMain");

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        first ? "pt-0" : "border-t border-border pt-3",
        isDragging && "z-10 opacity-50"
      )}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t("reorderSection", { section: sectionName })}
          title={t("reorderSection", { section: sectionName })}
          className="-ms-1.5 cursor-grab touch-none rounded p-1.5 text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        {title ? (
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
        ) : (
          <span className="sr-only">{sectionName}</span>
        )}
        <span className="ms-auto flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={!canMoveUp}
            onClick={onMoveUp}
            aria-label={t("moveSectionUp", { section: sectionName })}
            title={t("moveSectionUp", { section: sectionName })}
          >
            <ChevronUp className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={!canMoveDown}
            onClick={onMoveDown}
            aria-label={t("moveSectionDown", { section: sectionName })}
            title={t("moveSectionDown", { section: sectionName })}
          >
            <ChevronDown className="size-4" />
          </Button>
        </span>
      </div>
      <div className="mt-1">{children}</div>
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
  onAddSession,
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
  /** Adds an extra session (AM/PM split) under this day; absent on a session itself. */
  onAddSession?: () => void;
}) {
  const t = useTranslations("programs.builder");
  const tErrors = useTranslations("programs.errors");
  const router = useRouter();
  const readOnly = week !== 1;
  const isSession = day.parent_day_id != null;
  const [items, setItems] = useState(day.program_items);
  const [sectionOrder, setSectionOrder] = useState(() => normalizeSectionOrder(day.section_order));
  const [activityDialog, setActivityDialog] = useState<{
    activity?: Activity;
    kind?: "cardio" | "recovery";
  } | null>(null);
  const [pendingDeleteActivity, setPendingDeleteActivity] = useState<string | null>(null);
  const [itemDialog, setItemDialog] = useState<{
    item?: Item;
    initialExercise?: PickedExercise;
    initialBlock?: "mobility" | "rehab";
  } | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const [groupPending, startGroupTransition] = useTransition();
  // null = closed; "create" groups the selected items; otherwise edits that
  // existing group (all of its member ids).
  const [formatDialog, setFormatDialog] = useState<
    { mode: "create" } | { mode: "edit"; ids: string[]; kind: GroupKind; config: GroupConfig | null } | null
  >(null);
  const tFormat = useTranslations("programs.builder.groupFormat");

  const workoutItems = items.filter((i) => i.block !== "mobility" && i.block !== "rehab");
  const otherItems = items.filter((i) => i.block === "mobility" || i.block === "rehab");

  // Only sections that actually have content render, but the persisted order
  // keeps a slot for the empty ones too (see day-sections.ts) so a section
  // that temporarily has nothing does not reshuffle the others.
  const visibleSections = sectionOrder.filter((key) => {
    if (key === "workout") return workoutItems.length > 0;
    if (key === "mobility_rehab") return otherItems.length > 0;
    return day.program_activities.length > 0;
  });

  function sectionTitle(key: DaySectionKey): string | null {
    if (key === "mobility_rehab") return t("mobilityRehab");
    if (key === "activities") return t("activities");
    return null; // the unnamed main workout section
  }

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

  // Per-group format info for the chips: members, kind, config — read off the
  // first member (the config is stored identically on every member).
  const groupInfo = new Map<string, { ids: string[]; kind: GroupKind; config: GroupConfig }>();
  for (const item of workoutItems) {
    if (!item.group_key) continue;
    const kind = asGroupKind(item.group_kind);
    if (!kind) continue;
    const existing = groupInfo.get(item.group_key);
    if (existing) existing.ids.push(item.id);
    else groupInfo.set(item.group_key, { ids: [item.id], kind, config: parseGroupConfig(item.group_config) });
  }
  function badgeFor(item: Item): { text: string; onEdit: () => void } | null {
    if (!item.group_key) return null;
    const info = groupInfo.get(item.group_key);
    // Only the first member carries the chip, and plain superset/circuit
    // groups keep their existing A1/A2-only look.
    if (!info || info.ids[0] !== item.id || info.kind === "superset" || info.kind === "circuit") return null;
    const detail = formatGroupConfig(info.kind, info.config);
    return {
      text: detail ? `${tFormat(`kinds.${info.kind}`)} ${detail}` : tFormat(`kinds.${info.kind}`),
      onEdit: () => setFormatDialog({ mode: "edit", ids: info.ids, kind: info.kind, config: info.config }),
    };
  }

  function toggleSelect(itemId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function makeGroup(kind: GroupKind) {
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

  /** Optimistic section reorder: paint the new order immediately, persist via
   * the server action, and roll back to the pre-gesture order on a real error
   * (same pattern as the item drag above). */
  function persistSectionOrder(next: DaySectionKey[]) {
    const previous = sectionOrder;
    setSectionOrder(next);
    startTransition(async () => {
      const result = await reorderSectionsAction(locale, programId, day.id, next);
      if (result?.error) {
        toast.error(tErrors(result.error));
        setSectionOrder(previous);
        router.refresh();
      }
    });
  }

  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = visibleSections.indexOf(active.id as DaySectionKey);
    const toIndex = visibleSections.indexOf(over.id as DaySectionKey);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...visibleSections];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    persistSectionOrder(reorderVisibleSections(sectionOrder, reordered));
  }

  function moveSection(key: DaySectionKey, delta: -1 | 1) {
    const next = moveVisibleSection(sectionOrder, visibleSections, key, delta);
    if (next) persistSectionOrder(next);
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

  /** The body of one section, without its header — SortableSection supplies
   * the header (drag handle, title, up/down). The workout branch keeps its
   * own item-level DndContext for exercise reordering. */
  function renderSectionBody(key: DaySectionKey) {
    if (key === "workout") {
      if (workoutItems.length === 0) return null;
      if (readOnly) {
        return (
          <div className="flex flex-col gap-1">
            {workoutItems.map((item) => (
              <SortableItem
                key={item.id}
                item={item}
                locale={locale}
                week={week}
                groupLabel={groupLabels.get(item.id) ?? null}
                groupBadge={badgeFor(item)}
                selected={false}
                onToggleSelect={() => {}}
                onEdit={() => {}}
                onDelete={() => {}}
                onDuplicate={() => {}}
              />
            ))}
          </div>
        );
      }
      return (
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
                groupBadge={badgeFor(item)}
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
      );
    }

    if (key === "mobility_rehab") {
      if (otherItems.length === 0) return null;
      return (
        <div className="flex flex-col gap-1">
          {otherItems.map((item) => (
            <SortableItem
              key={item.id}
              item={item}
              locale={locale}
              week={week}
              groupLabel={null}
              groupBadge={null}
              selected={false}
              onToggleSelect={() => {}}
              onEdit={() => setItemDialog({ item })}
              onDelete={() => setPendingDeleteItem(item.id)}
              onDuplicate={() => duplicateItem(item.id)}
            />
          ))}
        </div>
      );
    }

    if (day.program_activities.length === 0) return null;
    return (
      <div className="flex flex-col gap-1">
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
    );
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
          {isSession ? t("sessionN", { n: day.day_index }) : t("dayN", { n: day.day_index })}
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
              {!isSession && <DropdownMenuItem onClick={duplicateDay}>{t("duplicateDay")}</DropdownMenuItem>}
              {onAddSession && !readOnly && <DropdownMenuItem onClick={onAddSession}>{t("addSession")}</DropdownMenuItem>}
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={groupPending}
                onClick={() => setFormatDialog({ mode: "create" })}
              >
                <Link2 className="size-4" />
                {t("makeTimedGroup")}
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
      {formatDialog && (
        <GroupFormatDialog
          key={formatDialog.mode === "edit" ? formatDialog.ids.join(",") : "create"}
          open
          onOpenChange={(open) => !open && setFormatDialog(null)}
          initialKind={formatDialog.mode === "edit" ? formatDialog.kind : "amrap"}
          initialConfig={formatDialog.mode === "edit" ? formatDialog.config : defaultGroupConfig("amrap")}
          onConfirm={async (kind, config) => {
            const dialog = formatDialog;
            const result =
              dialog.mode === "edit"
                ? await setGroupFormatAction(locale, programId, dialog.ids, kind, config)
                : await groupItemsAction(locale, programId, Array.from(selected), kind, config);
            if (result?.error) return result;
            if (dialog.mode === "create") setSelected(new Set());
            router.refresh();
          }}
        />
      )}
      <CardContent className="flex flex-col gap-4">
        {items.length === 0 && day.program_activities.length === 0 && !hasNote ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("noItems")}</p>
        ) : (
          <>
            {readOnly ? (
              <div className="flex flex-col gap-4">
                {visibleSections.map((key, index) => (
                  <div key={key} className={index === 0 ? undefined : "border-t border-border pt-3"}>
                    {sectionTitle(key) && (
                      <p className="mb-1 text-xs font-medium text-muted-foreground">{sectionTitle(key)}</p>
                    )}
                    {renderSectionBody(key)}
                  </div>
                ))}
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
                <SortableContext items={visibleSections} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-4">
                    {visibleSections.map((key, index) => (
                      <SortableSection
                        key={key}
                        id={key}
                        title={sectionTitle(key)}
                        first={index === 0}
                        canMoveUp={index > 0}
                        canMoveDown={index < visibleSections.length - 1}
                        onMoveUp={() => moveSection(key, -1)}
                        onMoveDown={() => moveSection(key, 1)}
                      >
                        {renderSectionBody(key)}
                      </SortableSection>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
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
  const weekPlan = parseWeekPlan(tree.week_plan);
  const [week, setWeek] = useState(1);
  const readOnly = week !== 1;
  const [dayDialog, setDayDialog] = useState<{ day?: Day; parentDayId?: string } | null>(null);
  const [pendingDeleteDay, setPendingDeleteDay] = useState<string | null>(null);
  const [pendingDeleteProgram, setPendingDeleteProgram] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();
  const [, startReorderTransition] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    // Only calendar days are reordered; a day's extra sessions stay attached to it.
    const calendar = primaryDays(days);
    const fromIndex = calendar.findIndex((d) => d.id === active.id);
    const toIndex = calendar.findIndex((d) => d.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;

    const previous = days;
    const reordered = [...calendar];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setDays([...reordered, ...days.filter((d) => d.parent_day_id != null)]);

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

  const calendarDays = primaryDays(days);

  /** One calendar day's card, with its extra sessions nested beneath it. */
  function renderDay(day: Day) {
    return (
      <div key={day.id} className="flex flex-col gap-3">
        <DayCard
          locale={locale}
          programId={tree.id}
          day={day}
          week={week}
          rehabPhases={rehabPhases}
          dietVariant={tree.diet_variants.find((v) => v.id === day.diet_plan_id)}
          onEditDay={() => setDayDialog({ day })}
          onDeleteDay={() => setPendingDeleteDay(day.id)}
          onAddSession={() => setDayDialog({ parentDayId: day.id })}
        />
        {sessionsOf(days, day.id).map((session) => (
          <div key={session.id} className="ms-6 border-s-2 border-border ps-3">
            <DayCard
              locale={locale}
              programId={tree.id}
              day={session}
              week={week}
              rehabPhases={rehabPhases}
              onEditDay={() => setDayDialog({ day: session })}
              onDeleteDay={() => setPendingDeleteDay(session.id)}
            />
          </div>
        ))}
      </div>
    );
  }

  const nextDayIndex = days.length === 0 ? 1 : Math.max(...days.map((d) => d.day_index)) + 1;
  const rehabPhases = tree.rehab_protocols.flatMap((p) => p.rehab_phases);
  const [sidebarTab, setSidebarTab] = useState<"exercises" | "nutrition" | "rehab">("exercises");

  return (
    <WeekPlanContext.Provider value={weekPlan}>
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
              {Array.from({ length: MAX_PROGRAM_WEEKS }, (_, i) => i + 1).map((w) => {
                const name = modifierForWeek(weekPlan, w)?.label ?? (isDeloadWeek(weekPlan, w) ? t("deloadWeek") : null);
                return (
                  <option key={w} value={w}>
                    {name ? `${t("week", { n: w })} · ${name}` : t("week", { n: w })}
                  </option>
                );
              })}
            </select>
          </label>
          <WeekPlanDialog locale={locale} programId={tree.id} plan={weekPlan} />
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
              {calendarDays.map(renderDay)}
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={calendarDays.map((d) => d.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-4">
                  {calendarDays.map(renderDay)}
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
            <NutritionPanel locale={locale} programId={tree.id} days={calendarDays} variants={tree.diet_variants} />
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
          parentDayId={dayDialog.parentDayId}
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
    </WeekPlanContext.Provider>
  );
}
