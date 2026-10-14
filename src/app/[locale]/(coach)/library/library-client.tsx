"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Dumbbell, Search, SearchX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatNumber } from "@/lib/format";
import { MUSCLE_GROUPS, FOOD_CATEGORIES } from "@/domain/library/taxonomy";
import {
  exerciseQuery,
  foodQuery,
  libraryPageSize,
  parseLibraryParams,
  serializeLibraryParams,
  type LibraryParams,
  type LibraryTab,
} from "@/domain/library/library-params";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { TrashDialog } from "@/components/shared/trash-dialog";
import {
  searchExercisesAction,
  searchFoodsAction,
  exerciseFacetsAction,
  foodFacetsAction,
  getExerciseAction,
  getFoodAction,
  deleteExerciseAction,
  deleteFoodAction,
  moveExerciseAction,
  moveFoodAction,
  restoreExerciseAction,
  listArchivedExercisesAction,
} from "./actions";
import { UpgradePrompt } from "@/components/dashboard/upgrade-prompt";
import { ExerciseDialog } from "./exercise-dialog";
import { FoodDialog } from "./food-dialog";
import { ExerciseCard } from "./exercise-card";
import { FoodCard } from "./food-card";
import { SourceFilter } from "./source-filter";
import { GroupFilter } from "./group-filter";
import { EquipmentFilter } from "./equipment-filter";
import { GroupChips } from "./group-chips";
import { ExerciseTable, FoodTable } from "./list-view";
import { ExercisePreview, FoodPreview } from "./preview-panel";
import { ViewSwitcher, type LibraryView } from "./view-switcher";
import { NewRecipeButton, RecipeFilters, RecipesTab } from "./recipes-tab";
import type { searchRecipesAction } from "./recipes/actions";

type ExercisePage = Awaited<ReturnType<typeof searchExercisesAction>>;
type FoodPage = Awaited<ReturnType<typeof searchFoodsAction>>;
type RecipePage = Awaited<ReturnType<typeof searchRecipesAction>>;
type Facets = Awaited<ReturnType<typeof exerciseFacetsAction>>;
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

const SEARCH_DEBOUNCE_MS = 300;
const NO_FILTERS = { q: "", source: "all", group: null, cat: null, equip: null, tag: null } as const;

export function LibraryClient({
  locale,
  initialKey,
  initialExercises,
  initialFoods,
  initialRecipes,
  initialExerciseFacets,
  initialFoodFacets,
  canAddCustom,
}: {
  locale: AppLocale;
  /** serializeLibraryParams() of the URL state the server rendered the
   * initial* props for. */
  initialKey: string;
  /** Null for the tab that wasn't active on the server. */
  initialExercises: ExercisePage | null;
  initialFoods: FoodPage | null;
  initialRecipes: RecipePage | null;
  initialExerciseFacets: Facets;
  initialFoodFacets: Facets;
  /** Whether the plan includes a custom library. Without it the coach keeps
   * and can edit the entries they already have; adding (or cloning a global
   * one) is refused by the database and reported as upgrade_required. */
  canAddCustom: boolean;
}) {
  const t = useTranslations("library");
  const tEmpty = useTranslations("library.emptyStates");
  const tErrors = useTranslations("library.errors");
  const tFilters = useTranslations("library.filters");
  const tGroups = useTranslations("library.muscleGroups");
  const tCategories = useTranslations("library.foodCategories");

  // The URL is the source of truth for tab, view, filters and page, so they
  // survive a refresh and can be shared as a link.
  const searchParams = useSearchParams();
  const params = useMemo(() => parseLibraryParams(new URLSearchParams(searchParams.toString())), [searchParams]);
  const { tab, view } = params;
  const pageSize = libraryPageSize(view);

  // The input itself stays local so typing is instant; the URL (and with it
  // the queries) only follows once the coach pauses.
  const [search, setSearch] = useState(params.q);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const queryClient = useQueryClient();

  /** Rewrites the query string in place. history.replaceState is what Next
   * documents for this: useSearchParams picks the change up, but there's no
   * server round trip — the queries below do the fetching. Reads the live
   * URL rather than `params` so a debounced call can't write back stale
   * filters. Anything but an explicit page change returns to page 1. */
  function update(patch: Partial<LibraryParams>) {
    const current = parseLibraryParams(new URLSearchParams(window.location.search));
    const query = serializeLibraryParams({ ...current, page: 1, ...patch });
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }

  function updateSearch(value: string) {
    setSearch(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => update({ q: value.trim() }), SEARCH_DEBOUNCE_MS);
  }

  function clearFilters() {
    clearTimeout(searchTimer.current);
    setSearch("");
    update(NO_FILTERS);
  }

  // Server-rendered data seeds only the exact URL state it was fetched for.
  // Seeding a different filter or page would render the wrong slice while
  // the UI claims otherwise.
  const isInitial = serializeLibraryParams(params) === initialKey;

  const exercisesQuery = useQuery({
    queryKey: ["library", "exercises", params.q, params.source, params.group, params.equip, params.page, pageSize],
    queryFn: () => searchExercisesAction(exerciseQuery(params)),
    enabled: tab === "exercises",
    initialData: (isInitial && initialExercises) || undefined,
    // Keeps the previous page on screen while a new page/filter loads,
    // instead of flashing the empty state on every switch.
    placeholderData: keepPreviousData,
  });

  const foodsQuery = useQuery({
    queryKey: ["library", "foods", params.q, params.source, params.cat, params.page, pageSize],
    queryFn: () => searchFoodsAction(foodQuery(params)),
    enabled: tab === "foods",
    initialData: (isInitial && initialFoods) || undefined,
    placeholderData: keepPreviousData,
  });

  // Both tabs' counts are always live: the inactive tab's badge still has to
  // answer "how many foods match this search?".
  const exerciseFacetsQuery = useQuery({
    queryKey: ["library", "facets", "exercises", params.q, params.source, params.equip],
    queryFn: () => exerciseFacetsAction({ query: params.q, source: params.source, equipment: params.equip }),
    initialData: isInitial ? initialExerciseFacets : undefined,
    placeholderData: keepPreviousData,
  });

  const foodFacetsQuery = useQuery({
    queryKey: ["library", "facets", "foods", params.q, params.source],
    queryFn: () => foodFacetsAction({ query: params.q, source: params.source }),
    initialData: isInitial ? initialFoodFacets : undefined,
    placeholderData: keepPreviousData,
  });

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

  function select(id: string) {
    setSelectedId(id);
    // Below lg the preview stacks under the table, out of sight of the row
    // that was just tapped.
    if (!window.matchMedia("(min-width: 1024px)").matches) {
      previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const exercises = exercisesQuery.data?.rows ?? [];
  const foods = foodsQuery.data?.rows ?? [];
  const exercisesTotal = exercisesQuery.data?.total ?? 0;
  const foodsTotal = foodsQuery.data?.total ?? 0;
  // The service falls back to page 1 when the URL's page no longer exists
  // (a row was deleted, or the link is stale) and says so in `page` — but
  // while a new page is loading, the rows on screen are still the old ones.
  const exercisesPage = exercisesQuery.isPlaceholderData ? params.page : (exercisesQuery.data?.page ?? params.page);
  const foodsPage = foodsQuery.isPlaceholderData ? params.page : (foodsQuery.data?.page ?? params.page);

  // The list view always previews something: the picked row, or the first.
  const selectedExercise = exercises.find((e) => e.id === selectedId) ?? exercises[0];
  const selectedFood = foods.find((f) => f.id === selectedId) ?? foods[0];

  const exerciseActions = (ex: Exercise) => ({
    onDelete: () => setPendingDelete({ kind: "exercise", id: ex.id }),
    onClone: () => setEditing({ kind: "exercise", mode: "clone", item: ex }),
    onEdit: () => setEditing({ kind: "exercise", mode: "edit", item: ex }),
    onEditMyClone: () => startEditMyExerciseClone(ex.my_clone_id!),
  });
  const foodActions = (food: Food) => ({
    onDelete: () => setPendingDelete({ kind: "food", id: food.id }),
    onClone: () => setEditing({ kind: "food", mode: "clone", item: food }),
    onEdit: () => setEditing({ kind: "food", mode: "edit", item: food }),
    onEditMyClone: () => startEditMyFoodClone(food.my_clone_id!),
  });

  function renderEmpty(kind: LibraryTab) {
    // Three different dead ends, three different ways out: filters that
    // matched nothing (clear them), a coach with no items of their own yet
    // (explain what "mine" is), and a library that is simply empty.
    const narrowed =
      params.q !== "" || (kind === "exercises" ? params.group !== null || params.equip !== null : params.cat !== null);
    if (narrowed || params.source === "global") {
      return (
        <EmptyState
          icon={SearchX}
          title={tEmpty(`${kind}.noResults`)}
          description={tEmpty("noResultsHint")}
          action={
            <Button variant="outline" size="sm" onClick={clearFilters}>
              {tEmpty("clearAll")}
            </Button>
          }
        />
      );
    }
    if (params.source === "mine") {
      return <EmptyState icon={Dumbbell} title={tEmpty(`${kind}.mineNone`)} description={tEmpty("mineNoneHint")} />;
    }
    return <EmptyState icon={Dumbbell} title={tEmpty(`${kind}.none`)} description={tEmpty("noneHint")} />;
  }

  function tabCount(facets: Facets | undefined) {
    if (!facets) return null;
    return (
      <span className="rounded-md bg-muted px-1.5 font-mono text-xs tabular-nums text-muted-foreground">
        {formatNumber(facets.total, locale)}
      </span>
    );
  }

  return (
    <>
      <Tabs value={tab} onValueChange={(v) => update({ tab: v as LibraryTab })} className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="exercises" className="px-3">
              {t("tabs.exercises")}
              {tabCount(exerciseFacetsQuery.data)}
            </TabsTrigger>
            <TabsTrigger value="foods" className="px-3">
              {t("tabs.foods")}
              {tabCount(foodFacetsQuery.data)}
            </TabsTrigger>
            <TabsTrigger value="recipes" className="px-3">
              {t("tabs.recipes")}
            </TabsTrigger>
          </TabsList>
          {/* Recipes aren't plan-gated (yet): every coach can build them. */}
          {tab === "recipes" ? (
            <NewRecipeButton />
          ) : !canAddCustom ? (
            <UpgradePrompt feature="custom_library" />
          ) : tab === "exercises" ? (
            <ExerciseDialog locale={locale} mode="create" onSaved={invalidate} />
          ) : (
            <FoodDialog locale={locale} mode="create" onSaved={invalidate} />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder={t(`searchPlaceholder.${tab}`)}
              aria-label={t(`searchPlaceholder.${tab}`)}
              className="ps-9"
            />
          </div>
          {tab === "recipes" ? (
            <RecipeFilters params={params} onChange={update} />
          ) : (
            <>
          <SourceFilter
            value={params.source}
            onChange={(source) => update({ source })}
            namespace={tab === "exercises" ? "library.source" : "library.foodSource"}
          />
          {/* The cards view picks the group from its chip row instead. */}
          {view !== "card" &&
            (tab === "exercises" ? (
              <GroupFilter kind="exercises" value={params.group} onChange={(group) => update({ group })} />
            ) : (
              <GroupFilter kind="foods" value={params.cat} onChange={(cat) => update({ cat })} />
            ))}
          {tab === "exercises" && <EquipmentFilter value={params.equip} onChange={(equip) => update({ equip })} />}
          <ViewSwitcher value={view} onChange={(next) => update({ view: next })} />
          {/* Only exercises are soft-deleted; a deleted food is gone. */}
          {tab === "exercises" && (
            <TrashDialog
              iconOnly
              listArchived={listArchivedExercisesAction}
              restore={(id) => restoreExerciseAction(locale, id)}
              renderRow={(item) => pickLocale(item, locale, "name")}
              onRestored={invalidate}
            />
          )}
            </>
          )}
        </div>

        <TabsContent value="exercises" className="flex flex-col gap-4">
          {view === "card" && (
            <GroupChips
              label={tFilters("group")}
              allLabel={tFilters("all")}
              total={exerciseFacetsQuery.data?.total ?? 0}
              options={MUSCLE_GROUPS.map((g) => ({
                value: g,
                label: tGroups(g),
                count: exerciseFacetsQuery.data?.groups[g] ?? 0,
              }))}
              value={params.group}
              onChange={(group) => update({ group })}
            />
          )}
          {exercisesQuery.isPending ? (
            <LibraryViewSkeleton view={view} />
          ) : exercises.length === 0 ? (
            renderEmpty("exercises")
          ) : (
            <div
              className={
                exercisesQuery.isFetching ? "opacity-60 transition-opacity" : "transition-opacity"
              }
            >
              {view === "list" ? (
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
                  <section aria-label={t("tabs.exercises")} className="min-w-0 flex-1 overflow-hidden rounded-xl border bg-card">
                    <ExerciseTable
                      exercises={exercises}
                      locale={locale}
                      selectedId={selectedExercise?.id ?? null}
                      onSelect={select}
                    />
                    {exercisesTotal > pageSize && (
                      <div className="border-t px-4 pb-3">
                        <Pagination
                          page={exercisesPage}
                          pageSize={pageSize}
                          total={exercisesTotal}
                          onPageChange={(page) => update({ page })}
                          disabled={exercisesQuery.isFetching}
                        />
                      </div>
                    )}
                  </section>
                  <div ref={previewRef} className="scroll-mt-4 lg:sticky lg:top-4 lg:w-80 lg:shrink-0">
                    {selectedExercise && (
                      <ExercisePreview
                        // Remount per exercise so a playing embed doesn't carry over.
                        key={selectedExercise.id}
                        exercise={selectedExercise}
                        locale={locale}
                        {...exerciseActions(selectedExercise)}
                      />
                    )}
                  </div>
                </div>
              ) : view === "card" ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                  {exercises.map((ex) => (
                    <ExerciseCard key={ex.id} exercise={ex} locale={locale} {...exerciseActions(ex)} />
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
          {view !== "list" && (
            <Pagination
              page={exercisesPage}
              pageSize={pageSize}
              total={exercisesTotal}
              onPageChange={(page) => update({ page })}
              disabled={exercisesQuery.isFetching}
            />
          )}
        </TabsContent>

        <TabsContent value="foods" className="flex flex-col gap-4">
          {view === "card" && (
            <GroupChips
              label={tFilters("category")}
              allLabel={tFilters("all")}
              total={foodFacetsQuery.data?.total ?? 0}
              options={FOOD_CATEGORIES.map((c) => ({
                value: c,
                label: tCategories(c),
                count: foodFacetsQuery.data?.groups[c] ?? 0,
              }))}
              value={params.cat}
              onChange={(cat) => update({ cat })}
            />
          )}
          {foodsQuery.isPending ? (
            <LibraryViewSkeleton view={view} />
          ) : foods.length === 0 ? (
            renderEmpty("foods")
          ) : (
            <div className={foodsQuery.isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
              {view === "list" ? (
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
                  <section aria-label={t("tabs.foods")} className="min-w-0 flex-1 overflow-hidden rounded-xl border bg-card">
                    <FoodTable
                      foods={foods}
                      locale={locale}
                      selectedId={selectedFood?.id ?? null}
                      onSelect={select}
                    />
                    {foodsTotal > pageSize && (
                      <div className="border-t px-4 pb-3">
                        <Pagination
                          page={foodsPage}
                          pageSize={pageSize}
                          total={foodsTotal}
                          onPageChange={(page) => update({ page })}
                          disabled={foodsQuery.isFetching}
                        />
                      </div>
                    )}
                  </section>
                  <div ref={previewRef} className="scroll-mt-4 lg:sticky lg:top-4 lg:w-80 lg:shrink-0">
                    {selectedFood && (
                      <FoodPreview food={selectedFood} locale={locale} {...foodActions(selectedFood)} />
                    )}
                  </div>
                </div>
              ) : view === "card" ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                  {foods.map((food) => (
                    <FoodCard key={food.id} food={food} locale={locale} {...foodActions(food)} />
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
          {view !== "list" && (
            <Pagination
              page={foodsPage}
              pageSize={pageSize}
              total={foodsTotal}
              onPageChange={(page) => update({ page })}
              disabled={foodsQuery.isFetching}
            />
          )}
        </TabsContent>
        <TabsContent value="recipes">
          {tab === "recipes" && (
            <RecipesTab
              locale={locale}
              params={params}
              initialRecipes={isInitial ? initialRecipes : null}
              onPage={(page) => update({ page })}
              onClearFilters={clearFilters}
            />
          )}
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
        description={pendingDelete?.kind === "exercise" ? t("deleteConfirmBodyExercise") : t("deleteConfirmBody")}
        confirmLabel={t("delete")}
        onConfirm={onConfirmDelete}
      />
    </>
  );
}

/** The coach list view's own skeleton: taller rows (48px thumbnails) and the
 * preview panel beside them. Everything else is the shared LibrarySkeleton. */
function LibraryViewSkeleton({ view }: { view: LibraryView }) {
  if (view !== "list") return <LibrarySkeleton view={view} />;
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
      <Skeleton className="h-96 w-full lg:w-80 lg:shrink-0" />
    </div>
  );
}

export function LibrarySkeleton({ view }: { view: LibraryView }) {
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
