"use client";

import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy, Dumbbell, Film, Image as ImageIcon, Link2, Minus, Pencil, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { MUSCLE_GROUPS, FOOD_CATEGORIES, isKnownMuscleGroup } from "@/domain/library/taxonomy";
import type { LibrarySource } from "@/domain/library/library.service";
import { resolveExerciseMedia } from "@/lib/video-embed";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import {
  searchExercisesAction,
  searchFoodsAction,
  getExerciseAction,
  getFoodAction,
  deleteExerciseAction,
  deleteFoodAction,
  moveExerciseAction,
  moveFoodAction,
} from "./actions";
import { ExerciseDialog } from "./exercise-dialog";
import { FoodDialog } from "./food-dialog";
import { ExerciseCard } from "./exercise-card";
import { FoodCard } from "./food-card";
import { SourceFilter } from "./source-filter";
import { GroupFilter } from "./group-filter";
import { ViewSwitcher, type LibraryView } from "./view-switcher";

type ExercisePage = Awaited<ReturnType<typeof searchExercisesAction>>;
type FoodPage = Awaited<ReturnType<typeof searchFoodsAction>>;
type Exercise = ExercisePage["rows"][number];
type Food = FoodPage["rows"][number];

type PendingDelete = { kind: "exercise" | "food"; id: string };

// Drives the controlled clone/edit dialog. "clone" prefills from the global
// row already in hand; "edit" prefills from the coach's own row — which,
// for "Edit my version" on a global card, isn't in hand yet (the card only
// carries my_clone_id) and gets fetched first, see startEditMyExerciseClone.
type Editing =
  | { kind: "exercise"; mode: "clone" | "edit"; item: Exercise }
  | { kind: "food"; mode: "clone" | "edit"; item: Food };

const LIST_KANBAN_PAGE_SIZE = 24;
const KANBAN_PAGE_SIZE = 48;

export function LibraryClient({
  locale,
  initialExercises,
  initialFoods,
}: {
  locale: AppLocale;
  initialExercises: ExercisePage;
  initialFoods: FoodPage;
}) {
  const t = useTranslations("library");
  const tEmpty = useTranslations("library.emptyStates");
  const tErrors = useTranslations("library.errors");
  const tGroups = useTranslations("library.muscleGroups");
  const tCategories = useTranslations("library.foodCategories");
  const tMedia = useTranslations("library.media");
  const [tab, setTab] = useState<"exercises" | "foods">("exercises");
  const [view, setView] = useState<LibraryView>("list");
  const [search, setSearch] = useState("");
  // One source for both tabs: a coach who filtered to "Mine" means it
  // whether they're looking at exercises or foods.
  const [source, setSource] = useState<LibrarySource>("all");
  // Group filter and page are per-tab: exercise muscle groups and food
  // categories are different vocabularies, and the two tabs paginate
  // independently (60 pages of exercises vs. 3 pages of foods).
  const [groupExercise, setGroupExercise] = useState<string | null>(null);
  const [groupFood, setGroupFood] = useState<string | null>(null);
  const [pageExercise, setPageExercise] = useState(1);
  const [pageFood, setPageFood] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);
  const queryClient = useQueryClient();

  // Kanban needs more items per column than a page of list/card rows, so it
  // gets its own page size — and, deliberately, its own query key. Switching
  // list <-> card keeps the same key (no refetch); switching to/from kanban
  // is a real filter change and fetches once.
  const pageSize = view === "kanban" ? KANBAN_PAGE_SIZE : LIST_KANBAN_PAGE_SIZE;

  function resetBothPages() {
    setPageExercise(1);
    setPageFood(1);
  }

  function updateSearch(value: string) {
    setSearch(value);
    resetBothPages();
  }

  function updateSource(value: LibrarySource) {
    setSource(value);
    resetBothPages();
  }

  function updateView(value: LibraryView) {
    setView(value);
    resetBothPages();
  }

  function updateGroupExercise(value: string | null) {
    setGroupExercise(value);
    setPageExercise(1);
  }

  function updateGroupFood(value: string | null) {
    setGroupFood(value);
    setPageFood(1);
  }

  // initialData seeds ONLY the untouched default view — page 1 at the
  // list/card page size. Seeding it for a narrower filter (or for kanban's
  // larger page) would render the wrong slice while the UI claims otherwise.
  const isDefaultExercises =
    debouncedSearch === "" &&
    source === "all" &&
    groupExercise === null &&
    pageExercise === 1 &&
    pageSize === LIST_KANBAN_PAGE_SIZE;
  const isDefaultFoods =
    debouncedSearch === "" &&
    source === "all" &&
    groupFood === null &&
    pageFood === 1 &&
    pageSize === LIST_KANBAN_PAGE_SIZE;

  const exercisesQuery = useQuery({
    queryKey: ["library", "exercises", debouncedSearch, source, groupExercise, pageExercise, pageSize],
    queryFn: () =>
      searchExercisesAction({
        query: debouncedSearch,
        source,
        group: groupExercise,
        page: pageExercise,
        pageSize,
      }),
    initialData: isDefaultExercises ? initialExercises : undefined,
    // Keeps the previous page on screen while a new page/filter loads,
    // instead of flashing the empty state on every switch.
    placeholderData: keepPreviousData,
  });

  const foodsQuery = useQuery({
    queryKey: ["library", "foods", debouncedSearch, source, groupFood, pageFood, pageSize],
    queryFn: () =>
      searchFoodsAction({ query: debouncedSearch, source, group: groupFood, page: pageFood, pageSize }),
    initialData: isDefaultFoods ? initialFoods : undefined,
    placeholderData: keepPreviousData,
  });

  // If the row a coach was looking at got deleted (by them or another
  // session) and their current page no longer exists, fall back to the last
  // real page instead of showing a dead empty page. Adjusted during render
  // (React's "adjusting state" pattern), not in an effect — the clamped
  // setState only fires when the value actually needs to change, so it
  // can't cascade into a render loop.
  if (exercisesQuery.data) {
    const maxPage = Math.max(1, Math.ceil(exercisesQuery.data.total / exercisesQuery.data.pageSize));
    if (pageExercise > maxPage) setPageExercise(maxPage);
  }
  if (foodsQuery.data) {
    const maxPage = Math.max(1, Math.ceil(foodsQuery.data.total / foodsQuery.data.pageSize));
    if (pageFood > maxPage) setPageFood(maxPage);
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["library"] });
  }

  function reportError(key: string) {
    // tErrors.has() guards against a Postgres code we haven't mapped —
    // next-intl would otherwise render the raw key.
    toast.error(tErrors.has(key) ? tErrors(key) : tErrors("unknown"));
  }

  // "Edit my version" on a global card only has my_clone_id — the clone's
  // own (possibly renamed) fields need a fresh read before the dialog can
  // prefill from them, unlike clone/edit-own which already have the full
  // row in hand.
  async function startEditMyExerciseClone(cloneId: string) {
    const clone = await getExerciseAction(cloneId);
    if (clone) setEditing({ kind: "exercise", mode: "edit", item: clone });
  }

  async function startEditMyFoodClone(cloneId: string) {
    const clone = await getFoodAction(cloneId);
    if (clone) setEditing({ kind: "food", mode: "edit", item: clone });
  }

  async function onConfirmDelete() {
    if (!pendingDelete) return;
    const { kind, id } = pendingDelete;
    setPendingDelete(null);
    const result =
      kind === "exercise"
        ? await deleteExerciseAction(locale, id)
        : await deleteFoodAction(locale, id);
    if (result?.error) {
      reportError(result.error);
      return;
    }
    invalidate();
  }

  const exercises = exercisesQuery.data?.rows ?? [];
  const foods = foodsQuery.data?.rows ?? [];
  const exercisesTotal = exercisesQuery.data?.total ?? 0;
  const foodsTotal = foodsQuery.data?.total ?? 0;
  const exercisesFirstLoad = exercisesQuery.isPending;
  const foodsFirstLoad = foodsQuery.isPending;

  function withClearGroup(action: React.ReactNode, kind: "exercises" | "foods") {
    const group = kind === "exercises" ? groupExercise : groupFood;
    if (!group) return action;
    const clear = () => (kind === "exercises" ? updateGroupExercise(null) : updateGroupFood(null));
    return (
      <div className="flex flex-wrap items-center justify-center gap-2">
        {action}
        <Button variant="outline" size="sm" onClick={clear}>
          {tEmpty("clearFilter")}
        </Button>
      </div>
    );
  }

  function renderEmpty(kind: "exercises" | "foods") {
    // The message has to name the active filter — "No results." under
    // "My Exercises" is indistinguishable from a broken page — and offer a
    // way out of the dead end.
    if (source === "mine" && !debouncedSearch) {
      return (
        <EmptyState
          icon={Dumbbell}
          title={tEmpty(`${kind}.mineNone`)}
          description={tEmpty("mineNoneHint")}
          action={withClearGroup(undefined, kind)}
        />
      );
    }
    if (source === "mine") {
      return (
        <EmptyState
          icon={Dumbbell}
          title={tEmpty(`${kind}.mineNoMatch`, { query: debouncedSearch })}
          action={withClearGroup(
            <Button variant="outline" size="sm" onClick={() => updateSource("all")}>
              {tEmpty("searchAll")}
            </Button>,
            kind
          )}
        />
      );
    }
    if (source === "global") {
      return (
        <EmptyState
          icon={Dumbbell}
          title={tEmpty(`${kind}.globalNoMatch`, { query: debouncedSearch })}
          description={tEmpty("globalNoMatchHint")}
          action={withClearGroup(
            <Button variant="outline" size="sm" onClick={() => updateSource("mine")}>
              {tEmpty("searchMine")}
            </Button>,
            kind
          )}
        />
      );
    }
    return <EmptyState icon={Dumbbell} title={t("empty")} action={withClearGroup(undefined, kind)} />;
  }

  function mediaIndicator(url: string | null) {
    const media = resolveExerciseMedia(url);
    if (!media) return <Minus className="size-4 text-muted-foreground/40" aria-label={tMedia("none")} />;
    if (media.kind === "image")
      return <ImageIcon className="size-4 text-muted-foreground" aria-label={tMedia("image")} />;
    if (media.kind === "embed")
      return <Film className="size-4 text-muted-foreground" aria-label={tMedia("video")} />;
    return <Link2 className="size-4 text-muted-foreground" aria-label={tMedia("link")} />;
  }

  return (
    <>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "exercises" | "foods")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="exercises">{t("tabs.exercises")}</TabsTrigger>
            <TabsTrigger value="foods">{t("tabs.foods")}</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder={t("search")}
              className="w-full sm:w-56"
            />
            <SourceFilter value={source} onChange={updateSource} />
            {tab === "exercises" ? (
              <GroupFilter kind="exercises" value={groupExercise} onChange={updateGroupExercise} />
            ) : (
              <GroupFilter kind="foods" value={groupFood} onChange={updateGroupFood} />
            )}
            <ViewSwitcher value={view} onChange={updateView} />
            {tab === "exercises" ? (
              <ExerciseDialog locale={locale} mode="create" onSaved={invalidate} />
            ) : (
              <FoodDialog locale={locale} mode="create" onSaved={invalidate} />
            )}
          </div>
        </div>

        <TabsContent value="exercises" className="mt-4 flex flex-col gap-3">
          {exercisesFirstLoad ? (
            <LibrarySkeleton view={view} />
          ) : exercises.length === 0 ? (
            renderEmpty("exercises")
          ) : (
            <div
              className={
                exercisesQuery.isFetching ? "opacity-60 transition-opacity" : "transition-opacity"
              }
            >
              {view === "list" ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-start">{t("columns.name")}</TableHead>
                      <TableHead className="text-start">{t("columns.group")}</TableHead>
                      <TableHead className="hidden text-start sm:table-cell">
                        {t("columns.equipment")}
                      </TableHead>
                      <TableHead className="hidden text-start sm:table-cell">
                        {t("columns.media")}
                      </TableHead>
                      <TableHead className="text-start">{t("columns.source")}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exercises.map((ex) => {
                      const groupLabel = isKnownMuscleGroup(ex.muscle_group)
                        ? tGroups(ex.muscle_group)
                        : ex.muscle_group;
                      const isCustomized = !!ex.coach_id && !!ex.source_exercise_id;
                      return (
                        <TableRow key={ex.id}>
                          <TableCell className="max-w-56 truncate font-medium">
                            {pickLocale(ex, locale)}
                          </TableCell>
                          <TableCell>
                            {groupLabel ? (
                              <Badge variant="outline">{groupLabel}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground sm:table-cell">
                            {ex.equipment || "—"}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {mediaIndicator(ex.image_url || ex.video_url)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={ex.coach_id ? "secondary" : "outline"}>
                              {!ex.coach_id ? t("official") : isCustomized ? t("customized") : t("mine")}
                            </Badge>
                          </TableCell>
                          <TableCell className="flex justify-end gap-1">
                            {!ex.coach_id ? (
                              ex.my_clone_id ? (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={t("editMyVersion")}
                                  onClick={() => startEditMyExerciseClone(ex.my_clone_id!)}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={t("clone")}
                                  onClick={() => setEditing({ kind: "exercise", mode: "clone", item: ex })}
                                >
                                  <Copy className="size-4" />
                                </Button>
                              )
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={t("edit")}
                                  onClick={() => setEditing({ kind: "exercise", mode: "edit", item: ex })}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={t("delete")}
                                  onClick={() => setPendingDelete({ kind: "exercise", id: ex.id })}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : view === "card" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {exercises.map((ex) => (
                    <ExerciseCard
                      key={ex.id}
                      exercise={ex}
                      locale={locale}
                      onDelete={() => setPendingDelete({ kind: "exercise", id: ex.id })}
                      onClone={() => setEditing({ kind: "exercise", mode: "clone", item: ex })}
                      onEdit={() => setEditing({ kind: "exercise", mode: "edit", item: ex })}
                      onEditMyClone={() => startEditMyExerciseClone(ex.my_clone_id!)}
                    />
                  ))}
                </div>
              ) : (
                <KanbanBoard
                  columns={MUSCLE_GROUPS.map((g) => ({ key: g, label: tGroups(g) }))}
                  items={exercises}
                  getGroup={(ex) => ex.muscle_group ?? "other"}
                  isDraggable={(ex) => !!ex.coach_id}
                  onMove={async (ex, group) => {
                    const result = await moveExerciseAction(locale, ex.id, group);
                    if (result?.error) {
                      reportError(result.error);
                      return;
                    }
                    invalidate();
                  }}
                  renderCard={(ex) => (
                    <ExerciseCard
                      exercise={ex}
                      locale={locale}
                      onDelete={() => {}}
                      onClone={() => {}}
                      onEdit={() => {}}
                      onEditMyClone={() => {}}
                      variant="compact"
                    />
                  )}
                  emptyLabel={t("empty")}
                />
              )}
            </div>
          )}
          <Pagination
            page={pageExercise}
            pageSize={pageSize}
            total={exercisesTotal}
            onPageChange={setPageExercise}
            disabled={exercisesQuery.isFetching}
          />
        </TabsContent>

        <TabsContent value="foods" className="mt-4 flex flex-col gap-3">
          {foodsFirstLoad ? (
            <LibrarySkeleton view={view} />
          ) : foods.length === 0 ? (
            renderEmpty("foods")
          ) : (
            <div className={foodsQuery.isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
              {view === "list" ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-start">{t("columns.name")}</TableHead>
                      <TableHead className="hidden text-start sm:table-cell">
                        {t("columns.serving")}
                      </TableHead>
                      <TableHead className="text-start">{t("food.kcal")}</TableHead>
                      <TableHead className="hidden text-start md:table-cell">
                        {t("columns.macros")}
                      </TableHead>
                      <TableHead className="hidden text-start sm:table-cell">
                        {t("filters.category")}
                      </TableHead>
                      <TableHead className="text-start">{t("columns.source")}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {foods.map((food) => {
                      const isCustomized = !!food.coach_id && !!food.source_food_id;
                      return (
                        <TableRow key={food.id}>
                          <TableCell className="max-w-56 truncate font-medium">
                            {pickLocale(food, locale)}
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground sm:table-cell">
                            {food.serving_label}
                          </TableCell>
                          <TableCell className="tabular-nums">{food.kcal}</TableCell>
                          <TableCell className="hidden text-xs tabular-nums text-muted-foreground md:table-cell">
                            {food.protein_g}P · {food.carb_g}C · {food.fat_g}F
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant="outline">{tCategories(food.category)}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={food.coach_id ? "secondary" : "outline"}>
                              {!food.coach_id ? t("official") : isCustomized ? t("customized") : t("mine")}
                            </Badge>
                          </TableCell>
                          <TableCell className="flex justify-end gap-1">
                            {!food.coach_id ? (
                              food.my_clone_id ? (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={t("editMyVersion")}
                                  onClick={() => startEditMyFoodClone(food.my_clone_id!)}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={t("clone")}
                                  onClick={() => setEditing({ kind: "food", mode: "clone", item: food })}
                                >
                                  <Copy className="size-4" />
                                </Button>
                              )
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={t("edit")}
                                  onClick={() => setEditing({ kind: "food", mode: "edit", item: food })}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={t("delete")}
                                  onClick={() => setPendingDelete({ kind: "food", id: food.id })}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : view === "card" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {foods.map((food) => (
                    <FoodCard
                      key={food.id}
                      food={food}
                      locale={locale}
                      onDelete={() => setPendingDelete({ kind: "food", id: food.id })}
                      onClone={() => setEditing({ kind: "food", mode: "clone", item: food })}
                      onEdit={() => setEditing({ kind: "food", mode: "edit", item: food })}
                      onEditMyClone={() => startEditMyFoodClone(food.my_clone_id!)}
                    />
                  ))}
                </div>
              ) : (
                <KanbanBoard
                  columns={FOOD_CATEGORIES.map((c) => ({ key: c, label: tCategories(c) }))}
                  items={foods}
                  getGroup={(food) => food.category}
                  isDraggable={(food) => !!food.coach_id}
                  onMove={async (food, category) => {
                    const result = await moveFoodAction(locale, food.id, category);
                    if (result?.error) {
                      reportError(result.error);
                      return;
                    }
                    invalidate();
                  }}
                  renderCard={(food) => (
                    <FoodCard
                      food={food}
                      locale={locale}
                      onDelete={() => {}}
                      onClone={() => {}}
                      onEdit={() => {}}
                      onEditMyClone={() => {}}
                      variant="compact"
                    />
                  )}
                  emptyLabel={t("empty")}
                />
              )}
            </div>
          )}
          <Pagination
            page={pageFood}
            pageSize={pageSize}
            total={foodsTotal}
            onPageChange={setPageFood}
            disabled={foodsQuery.isFetching}
          />
        </TabsContent>
      </Tabs>

      {editing?.kind === "exercise" && (
        <ExerciseDialog
          // key remounts the form so defaultValues track the selected row —
          // same reasoning as the admin GlobalExerciseDialog.
          key={`${editing.mode}-${editing.item.id}`}
          locale={locale}
          mode={editing.mode}
          item={editing.item}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
        />
      )}
      {editing?.kind === "food" && (
        <FoodDialog
          key={`${editing.mode}-${editing.item.id}`}
          locale={locale}
          mode={editing.mode}
          item={editing.item}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t("deleteConfirmTitle")}
        description={t("deleteConfirmBody")}
        confirmLabel={t("delete")}
        onConfirm={onConfirmDelete}
      />
    </>
  );
}

function LibrarySkeleton({ view }: { view: LibraryView }) {
  if (view === "list") {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (view === "kanban") {
    return (
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-72 w-64 shrink-0" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-56 w-full" />
      ))}
    </div>
  );
}
