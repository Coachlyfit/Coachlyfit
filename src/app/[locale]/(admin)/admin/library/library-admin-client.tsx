"use client";

import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowUpCircle, Dumbbell, Film, Link2, Minus, Pencil, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pagination } from "@/components/ui/pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { MUSCLE_GROUPS, FOOD_CATEGORIES, isKnownMuscleGroup } from "@/domain/library/taxonomy";
import type { LibrarySource } from "@/domain/library/library.service";
import { resolveExerciseMedia } from "@/lib/video-embed";
import { SourceFilter } from "@/app/[locale]/(coach)/library/source-filter";
import { GroupFilter } from "@/app/[locale]/(coach)/library/group-filter";
import { ViewSwitcher, type LibraryView } from "@/app/[locale]/(coach)/library/view-switcher";
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
type Exercise = ExercisePage["rows"][number];
type Food = FoodPage["rows"][number];

type Pending = { kind: "exercise" | "food"; id: string };

// Kanban needs more items per column than a page of list/card rows, so it
// gets its own page size (and query key) — same split as the coach library.
const LIST_KANBAN_PAGE_SIZE = 24;
const KANBAN_PAGE_SIZE = 48;

export function LibraryAdminClient({
  locale,
  initialExercises,
  initialFoods,
}: {
  locale: AppLocale;
  initialExercises: ExercisePage;
  initialFoods: FoodPage;
}) {
  const t = useTranslations("library");
  const tAdmin = useTranslations("admin.library");
  const tErrors = useTranslations("library.errors");
  const tGroups = useTranslations("library.muscleGroups");
  const tCategories = useTranslations("library.foodCategories");
  const tMedia = useTranslations("library.media");
  const [tab, setTab] = useState<"exercises" | "foods">("exercises");
  const [view, setView] = useState<LibraryView>("list");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<LibrarySource>("all");
  const [groupExercise, setGroupExercise] = useState<string | null>(null);
  const [groupFood, setGroupFood] = useState<string | null>(null);
  const [pageExercise, setPageExercise] = useState(1);
  const [pageFood, setPageFood] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<Pending | null>(null);
  const [pendingPromote, setPendingPromote] = useState<Pending | null>(null);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [editingFood, setEditingFood] = useState<Food | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);
  const queryClient = useQueryClient();

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

  // initialData seeds ONLY the untouched default view (see library-client.tsx).
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
    queryKey: ["admin-library", "exercises", debouncedSearch, source, groupExercise, pageExercise, pageSize],
    queryFn: () =>
      adminSearchExercisesAction({
        query: debouncedSearch,
        source,
        group: groupExercise,
        page: pageExercise,
        pageSize,
      }),
    initialData: isDefaultExercises ? initialExercises : undefined,
    placeholderData: keepPreviousData,
  });

  const foodsQuery = useQuery({
    queryKey: ["admin-library", "foods", debouncedSearch, source, groupFood, pageFood, pageSize],
    queryFn: () =>
      adminSearchFoodsAction({ query: debouncedSearch, source, group: groupFood, page: pageFood, pageSize }),
    initialData: isDefaultFoods ? initialFoods : undefined,
    placeholderData: keepPreviousData,
  });

  // Adjusted during render, not in an effect — see library-client.tsx for
  // why (the same delete-shrinks-total case applies here).
  if (exercisesQuery.data) {
    const maxPage = Math.max(1, Math.ceil(exercisesQuery.data.total / exercisesQuery.data.pageSize));
    if (pageExercise > maxPage) setPageExercise(maxPage);
  }
  if (foodsQuery.data) {
    const maxPage = Math.max(1, Math.ceil(foodsQuery.data.total / foodsQuery.data.pageSize));
    if (pageFood > maxPage) setPageFood(maxPage);
  }

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

  const exercises = exercisesQuery.data?.rows ?? [];
  const foods = foodsQuery.data?.rows ?? [];
  const exercisesTotal = exercisesQuery.data?.total ?? 0;
  const foodsTotal = foodsQuery.data?.total ?? 0;

  const emptyTitle =
    source === "mine" ? tAdmin("emptyCoach") : source === "global" ? tAdmin("emptyGlobal") : t("empty");

  function ownerBadge(coachId: string | null) {
    return (
      <Badge variant={coachId ? "secondary" : "outline"}>
        {coachId ? tAdmin("coachOwner") : tAdmin("globalOwner")}
      </Badge>
    );
  }

  function mediaIndicator(url: string | null) {
    const media = resolveExerciseMedia(url);
    if (!media) return <Minus className="size-4 text-muted-foreground/40" aria-label={tMedia("none")} />;
    if (media.kind === "image")
      return (
        <img
          src={media.src}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-8 rounded-sm object-cover"
          aria-label={tMedia("image")}
        />
      );
    if (media.kind === "embed")
      return <Film className="size-4 text-muted-foreground" aria-label={tMedia("video")} />;
    return <Link2 className="size-4 text-muted-foreground" aria-label={tMedia("link")} />;
  }

  function promoteButton(kind: Pending["kind"], id: string) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setPendingPromote({ kind, id })}>
        <ArrowUpCircle className="size-4" />
        {tAdmin("promote")}
      </Button>
    );
  }

  function editDeleteButtons(kind: Pending["kind"], onEdit: () => void, id: string) {
    return (
      <>
        <Button variant="ghost" size="icon-sm" aria-label={tAdmin("edit")} onClick={onEdit}>
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("delete")}
          onClick={() => setPendingDelete({ kind, id })}
        >
          <Trash2 className="size-4" />
        </Button>
      </>
    );
  }

  return (
    <>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "exercises" | "foods")}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="exercises">{t("tabs.exercises")}</TabsTrigger>
            <TabsTrigger value="foods">{t("tabs.foods")}</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2">
            <SourceFilter value={source} onChange={updateSource} namespace="admin.library.source" />
            <Input
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder={t("search")}
              className="w-full sm:w-56"
            />
            {tab === "exercises" ? (
              <GroupFilter kind="exercises" value={groupExercise} onChange={updateGroupExercise} />
            ) : (
              <GroupFilter kind="foods" value={groupFood} onChange={updateGroupFood} />
            )}
            <ViewSwitcher value={view} onChange={updateView} />
            {tab === "exercises" ? (
              <>
                <TrashDialog
                  listArchived={listArchivedGlobalExercisesAction}
                  restore={(id) => restoreGlobalExerciseAction(locale, id)}
                  renderRow={(item) => pickLocale(item, locale, "name")}
                  onRestored={invalidate}
                />
                <GlobalExerciseDialog locale={locale} onSaved={invalidate} />
              </>
            ) : (
              <GlobalFoodDialog locale={locale} onSaved={invalidate} />
            )}
          </div>
        </div>

        <TabsContent value="exercises" className="mt-4 flex flex-col gap-3">
          {exercisesQuery.isPending ? (
            <LibrarySkeleton view={view} />
          ) : exercises.length === 0 ? (
            <EmptyState icon={Dumbbell} title={emptyTitle} />
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
                      <TableHead className="text-start">{tAdmin("owner")}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exercises.map((ex) => {
                      const groupLabel = isKnownMuscleGroup(ex.muscle_group)
                        ? tGroups(ex.muscle_group)
                        : ex.muscle_group;
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
                            {mediaIndicator(ex.thumbnail_url || ex.image_url || ex.video_url)}
                          </TableCell>
                          <TableCell>{ownerBadge(ex.coach_id)}</TableCell>
                          <TableCell>
                            {/* A coach-owned row is read-only here: admin_update_global
                                is qualified `coach_id is null`, so the only write an
                                admin has on it is promotion. */}
                            <div className="flex justify-end gap-1">
                              {ex.coach_id
                                ? promoteButton("exercise", ex.id)
                                : editDeleteButtons("exercise", () => setEditingExercise(ex), ex.id)}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : view === "card" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
          <Pagination
            page={pageExercise}
            pageSize={pageSize}
            total={exercisesTotal}
            onPageChange={setPageExercise}
            disabled={exercisesQuery.isFetching}
          />
        </TabsContent>

        <TabsContent value="foods" className="mt-4 flex flex-col gap-3">
          {foodsQuery.isPending ? (
            <LibrarySkeleton view={view} />
          ) : foods.length === 0 ? (
            <EmptyState icon={Dumbbell} title={emptyTitle} />
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
                      <TableHead className="text-start">{tAdmin("owner")}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {foods.map((food) => (
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
                        <TableCell>{ownerBadge(food.coach_id)}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {food.coach_id
                              ? promoteButton("food", food.id)
                              : editDeleteButtons("food", () => setEditingFood(food), food.id)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : view === "card" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
          <Pagination
            page={pageFood}
            pageSize={pageSize}
            total={foodsTotal}
            onPageChange={setPageFood}
            disabled={foodsQuery.isFetching}
          />
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
