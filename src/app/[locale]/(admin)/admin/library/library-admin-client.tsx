"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowUpCircle, Dumbbell, Pencil, Search, SearchX, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pagination } from "@/components/ui/pagination";
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
import { exerciseFacetsAction, foodFacetsAction } from "@/domain/library/library-actions";
import { SourceFilter } from "@/app/[locale]/(coach)/library/source-filter";
import { GroupFilter } from "@/app/[locale]/(coach)/library/group-filter";
import { EquipmentFilter } from "@/app/[locale]/(coach)/library/equipment-filter";
import { GroupChips } from "@/app/[locale]/(coach)/library/group-chips";
import { ExerciseTable, FoodTable } from "@/app/[locale]/(coach)/library/list-view";
import { ExercisePreview, FoodPreview } from "@/app/[locale]/(coach)/library/preview-panel";
import { ViewSwitcher } from "@/app/[locale]/(coach)/library/view-switcher";
import { LibrarySkeleton } from "@/app/[locale]/(coach)/library/library-client";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { TrashDialog } from "@/components/shared/trash-dialog";
import {
  adminSearchExercisesAction,
  adminSearchFoodsAction,
  deleteGlobalExerciseAction,
  deleteGlobalFoodAction,
  listArchivedGlobalExercisesAction,
  promoteExerciseAction,
  promoteFoodAction,
  restoreGlobalExerciseAction,
} from "./actions";
import { GlobalExerciseDialog } from "./global-exercise-dialog";
import { GlobalFoodDialog } from "./global-food-dialog";
import { AdminExerciseCard } from "./admin-exercise-card";
import { AdminFoodCard } from "./admin-food-card";

type ExercisePage = Awaited<ReturnType<typeof adminSearchExercisesAction>>;
type FoodPage = Awaited<ReturnType<typeof adminSearchFoodsAction>>;
type Facets = Awaited<ReturnType<typeof exerciseFacetsAction>>;
type Exercise = ExercisePage["rows"][number];
type Food = FoodPage["rows"][number];

type Pending = { kind: "exercise" | "food"; id: string };

const SEARCH_DEBOUNCE_MS = 300;
const NO_FILTERS = { q: "", source: "all", group: null, cat: null, equip: null } as const;

// Same layout, URL state and queries as the coach LibraryClient — only the
// row actions differ: a coach-owned row is promote-only (admin_update_global
// is qualified `coach_id is null`), a global row is edit/delete.
export function LibraryAdminClient({
  locale,
  initialKey,
  initialExercises,
  initialFoods,
  initialExerciseFacets,
  initialFoodFacets,
}: {
  locale: AppLocale;
  initialKey: string;
  initialExercises: ExercisePage | null;
  initialFoods: FoodPage | null;
  initialExerciseFacets: Facets;
  initialFoodFacets: Facets;
}) {
  const t = useTranslations("library");
  const tAdmin = useTranslations("admin.library");
  const tEmpty = useTranslations("library.emptyStates");
  const tErrors = useTranslations("library.errors");
  const tFilters = useTranslations("library.filters");
  const tGroups = useTranslations("library.muscleGroups");
  const tCategories = useTranslations("library.foodCategories");

  const searchParams = useSearchParams();
  const params = useMemo(() => parseLibraryParams(new URLSearchParams(searchParams.toString())), [searchParams]);
  const { tab, view } = params;
  const pageSize = libraryPageSize(view);

  const [search, setSearch] = useState(params.q);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [pendingDelete, setPendingDelete] = useState<Pending | null>(null);
  const [pendingPromote, setPendingPromote] = useState<Pending | null>(null);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [editingFood, setEditingFood] = useState<Food | null>(null);
  const queryClient = useQueryClient();

  // See library-client.tsx: replaceState keeps the URL shareable without a
  // server round trip; the queries below do the fetching.
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

  const isInitial = serializeLibraryParams(params) === initialKey;

  const exercisesQuery = useQuery({
    queryKey: ["admin-library", "exercises", params.q, params.source, params.group, params.equip, params.page, pageSize],
    queryFn: () => adminSearchExercisesAction(exerciseQuery(params)),
    enabled: tab === "exercises",
    initialData: (isInitial && initialExercises) || undefined,
    placeholderData: keepPreviousData,
  });

  const foodsQuery = useQuery({
    queryKey: ["admin-library", "foods", params.q, params.source, params.cat, params.page, pageSize],
    queryFn: () => adminSearchFoodsAction(foodQuery(params)),
    enabled: tab === "foods",
    initialData: (isInitial && initialFoods) || undefined,
    placeholderData: keepPreviousData,
  });

  const exerciseFacetsQuery = useQuery({
    queryKey: ["admin-library", "facets", "exercises", params.q, params.source, params.equip],
    queryFn: () => exerciseFacetsAction({ query: params.q, source: params.source, equipment: params.equip }),
    initialData: isInitial ? initialExerciseFacets : undefined,
    placeholderData: keepPreviousData,
  });

  const foodFacetsQuery = useQuery({
    queryKey: ["admin-library", "facets", "foods", params.q, params.source],
    queryFn: () => foodFacetsAction({ query: params.q, source: params.source }),
    initialData: isInitial ? initialFoodFacets : undefined,
    placeholderData: keepPreviousData,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin-library"] });
  }

  function reportError(key: string) {
    toast.error(tErrors.has(key) ? tErrors(key) : tErrors("unknown"));
  }

  async function onConfirmDelete() {
    if (!pendingDelete) return;
    const { kind, id } = pendingDelete;
    setPendingDelete(null);
    const result =
      kind === "exercise"
        ? await deleteGlobalExerciseAction(locale, id)
        : await deleteGlobalFoodAction(locale, id);
    if (result?.error) {
      reportError(result.error);
      return;
    }
    toast.success(tAdmin("deleted"));
    invalidate();
  }

  async function onConfirmPromote() {
    if (!pendingPromote) return;
    const { kind, id } = pendingPromote;
    setPendingPromote(null);
    const result =
      kind === "exercise"
        ? await promoteExerciseAction(locale, id)
        : await promoteFoodAction(locale, id);
    if (result?.error) {
      reportError(result.error);
      return;
    }
    toast.success(tAdmin("promoted"));
    invalidate();
  }

  function select(id: string) {
    setSelectedId(id);
    if (!window.matchMedia("(min-width: 1024px)").matches) {
      previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const exercises = exercisesQuery.data?.rows ?? [];
  const foods = foodsQuery.data?.rows ?? [];
  const exercisesTotal = exercisesQuery.data?.total ?? 0;
  const foodsTotal = foodsQuery.data?.total ?? 0;
  const exercisesPage = exercisesQuery.isPlaceholderData ? params.page : (exercisesQuery.data?.page ?? params.page);
  const foodsPage = foodsQuery.isPlaceholderData ? params.page : (foodsQuery.data?.page ?? params.page);

  const selectedExercise = exercises.find((e) => e.id === selectedId) ?? exercises[0];
  const selectedFood = foods.find((f) => f.id === selectedId) ?? foods[0];

  function panelActions(
    kind: Pending["kind"],
    id: string,
    coachOwned: boolean,
    onEdit: () => void
  ): ReactNode {
    if (coachOwned) {
      return (
        <Button variant="secondary" onClick={() => setPendingPromote({ kind, id })}>
          <ArrowUpCircle className="size-4" />
          {tAdmin("promote")}
        </Button>
      );
    }
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="flex-1" onClick={onEdit}>
          <Pencil className="size-4" />
          {tAdmin("edit")}
        </Button>
        <Button
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={() => setPendingDelete({ kind, id })}
        >
          <Trash2 className="size-4" />
          {t("delete")}
        </Button>
      </div>
    );
  }

  function renderEmpty(kind: LibraryTab) {
    const narrowed =
      params.q !== "" || (kind === "exercises" ? params.group !== null || params.equip !== null : params.cat !== null);
    if (narrowed) {
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
    const title =
      params.source === "mine" ? tAdmin("emptyCoach") : params.source === "global" ? tAdmin("emptyGlobal") : t("empty");
    return <EmptyState icon={Dumbbell} title={title} />;
  }

  function tabCount(facets: Facets | undefined) {
    if (!facets) return null;
    return (
      <span className="rounded-md bg-muted px-1.5 font-mono text-xs tabular-nums text-muted-foreground">
        {formatNumber(facets.total, locale)}
      </span>
    );
  }

  const coachBadge = tAdmin("coachOwner");

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
          </TabsList>
          {tab === "exercises" ? (
            <GlobalExerciseDialog locale={locale} onSaved={invalidate} />
          ) : (
            <GlobalFoodDialog locale={locale} onSaved={invalidate} />
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
          <SourceFilter
            value={params.source}
            onChange={(source) => update({ source })}
            namespace="admin.library.source"
          />
          {view !== "card" &&
            (tab === "exercises" ? (
              <GroupFilter kind="exercises" value={params.group} onChange={(group) => update({ group })} />
            ) : (
              <GroupFilter kind="foods" value={params.cat} onChange={(cat) => update({ cat })} />
            ))}
          {tab === "exercises" && <EquipmentFilter value={params.equip} onChange={(equip) => update({ equip })} />}
          <ViewSwitcher value={view} onChange={(next) => update({ view: next })} />
          {tab === "exercises" && (
            <TrashDialog
              iconOnly
              listArchived={listArchivedGlobalExercisesAction}
              restore={(id) => restoreGlobalExerciseAction(locale, id)}
              renderRow={(item) => pickLocale(item, locale, "name")}
              onRestored={invalidate}
            />
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
            <LibrarySkeleton view={view} />
          ) : exercises.length === 0 ? (
            renderEmpty("exercises")
          ) : (
            <div className={exercisesQuery.isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
              {view === "list" ? (
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
                  <section aria-label={t("tabs.exercises")} className="min-w-0 flex-1 overflow-hidden rounded-xl border bg-card">
                    <ExerciseTable
                      exercises={exercises}
                      locale={locale}
                      selectedId={selectedExercise?.id ?? null}
                      onSelect={select}
                      coachBadge={coachBadge}
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
                        key={selectedExercise.id}
                        exercise={selectedExercise}
                        locale={locale}
                        coachBadge={coachBadge}
                        actions={panelActions("exercise", selectedExercise.id, !!selectedExercise.coach_id, () =>
                          setEditingExercise(selectedExercise)
                        )}
                      />
                    )}
                  </div>
                </div>
              ) : view === "card" ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                  {exercises.map((ex) => (
                    <AdminExerciseCard
                      key={ex.id}
                      exercise={ex}
                      locale={locale}
                      onEdit={() => setEditingExercise(ex)}
                      onDelete={() => setPendingDelete({ kind: "exercise", id: ex.id })}
                      onPromote={() => setPendingPromote({ kind: "exercise", id: ex.id })}
                    />
                  ))}
                </div>
              ) : (
                <KanbanBoard
                  columns={MUSCLE_GROUPS.map((g) => ({ key: g, label: tGroups(g) }))}
                  items={exercises}
                  getGroup={(ex) => ex.muscle_group ?? "other"}
                  isDraggable={() => false}
                  onMove={() => {}}
                  renderCard={(ex) => (
                    <AdminExerciseCard
                      exercise={ex}
                      locale={locale}
                      onEdit={() => {}}
                      onDelete={() => {}}
                      onPromote={() => {}}
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
            <LibrarySkeleton view={view} />
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
                      coachBadge={coachBadge}
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
                      <FoodPreview
                        key={selectedFood.id}
                        food={selectedFood}
                        locale={locale}
                        coachBadge={coachBadge}
                        actions={panelActions("food", selectedFood.id, !!selectedFood.coach_id, () =>
                          setEditingFood(selectedFood)
                        )}
                      />
                    )}
                  </div>
                </div>
              ) : view === "card" ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                  {foods.map((food) => (
                    <AdminFoodCard
                      key={food.id}
                      food={food}
                      locale={locale}
                      onEdit={() => setEditingFood(food)}
                      onDelete={() => setPendingDelete({ kind: "food", id: food.id })}
                      onPromote={() => setPendingPromote({ kind: "food", id: food.id })}
                    />
                  ))}
                </div>
              ) : (
                <KanbanBoard
                  columns={FOOD_CATEGORIES.map((c) => ({ key: c, label: tCategories(c) }))}
                  items={foods}
                  getGroup={(food) => food.category}
                  isDraggable={() => false}
                  onMove={() => {}}
                  renderCard={(food) => (
                    <AdminFoodCard
                      food={food}
                      locale={locale}
                      onEdit={() => {}}
                      onDelete={() => {}}
                      onPromote={() => {}}
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
      </Tabs>

      {editingExercise && (
        <GlobalExerciseDialog
          // key remounts the form so defaultValues track the selected row.
          key={editingExercise.id}
          locale={locale}
          exercise={editingExercise}
          open
          onOpenChange={(open) => !open && setEditingExercise(null)}
          onSaved={() => {
            setEditingExercise(null);
            toast.success(tAdmin("updated"));
            invalidate();
          }}
        />
      )}
      {editingFood && (
        <GlobalFoodDialog
          key={editingFood.id}
          locale={locale}
          food={editingFood}
          open
          onOpenChange={(open) => !open && setEditingFood(null)}
          onSaved={() => {
            setEditingFood(null);
            toast.success(tAdmin("updated"));
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

      <ConfirmDialog
        open={pendingPromote !== null}
        onOpenChange={(open) => !open && setPendingPromote(null)}
        title={tAdmin("promoteConfirmTitle")}
        description={tAdmin("promoteConfirmBody")}
        confirmLabel={tAdmin("promote")}
        variant="default"
        onConfirm={onConfirmPromote}
      />
    </>
  );
}
