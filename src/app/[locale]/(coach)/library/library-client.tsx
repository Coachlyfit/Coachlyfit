"use client";

import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Dumbbell, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { MUSCLE_GROUPS, FOOD_CATEGORIES } from "@/domain/library/taxonomy";
import type { LibrarySource } from "@/domain/library/library.service";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import {
  searchExercisesAction,
  searchFoodsAction,
  deleteExerciseAction,
  deleteFoodAction,
  moveExerciseAction,
  moveFoodAction,
} from "./actions";
import { AddExerciseDialog } from "./add-exercise-dialog";
import { AddFoodDialog } from "./add-food-dialog";
import { ExerciseCard } from "./exercise-card";
import { FoodCard } from "./food-card";
import { SourceFilter } from "./source-filter";
import { ViewSwitcher, type LibraryView } from "./view-switcher";

type Exercise = Awaited<ReturnType<typeof searchExercisesAction>>[number];
type Food = Awaited<ReturnType<typeof searchFoodsAction>>[number];

type PendingDelete = { kind: "exercise" | "food"; id: string };

export function LibraryClient({
  locale,
  initialExercises,
  initialFoods,
}: {
  locale: AppLocale;
  initialExercises: Exercise[];
  initialFoods: Food[];
}) {
  const t = useTranslations("library");
  const tEmpty = useTranslations("library.emptyStates");
  const tErrors = useTranslations("library.errors");
  const tGroups = useTranslations("library.muscleGroups");
  const tCategories = useTranslations("library.foodCategories");
  const [tab, setTab] = useState<"exercises" | "foods">("exercises");
  const [view, setView] = useState<LibraryView>("list");
  const [search, setSearch] = useState("");
  // One source for both tabs: a coach who filtered to "Mine" means it
  // whether they're looking at exercises or foods.
  const [source, setSource] = useState<LibrarySource>("all");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);
  const queryClient = useQueryClient();

  // initialData seeds ONLY the untouched default view. Seeding it under a
  // narrower filter would render the full server-rendered list while the UI
  // claims to be filtered.
  const isDefaultView = debouncedSearch === "" && source === "all";

  const exercisesQuery = useQuery({
    queryKey: ["library", "exercises", debouncedSearch, source],
    queryFn: () => searchExercisesAction(debouncedSearch, source),
    initialData: isDefaultView ? initialExercises : undefined,
    // Keeps the previous list on screen while a new source/term loads,
    // instead of flashing the empty state on every switch.
    placeholderData: keepPreviousData,
  });

  const foodsQuery = useQuery({
    queryKey: ["library", "foods", debouncedSearch, source],
    queryFn: () => searchFoodsAction(debouncedSearch, source),
    initialData: isDefaultView ? initialFoods : undefined,
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

  const exercises = exercisesQuery.data ?? [];
  const foods = foodsQuery.data ?? [];

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
        />
      );
    }
    if (source === "mine") {
      return (
        <EmptyState
          icon={Dumbbell}
          title={tEmpty(`${kind}.mineNoMatch`, { query: debouncedSearch })}
          action={
            <Button variant="outline" size="sm" onClick={() => setSource("all")}>
              {tEmpty("searchAll")}
            </Button>
          }
        />
      );
    }
    if (source === "global") {
      return (
        <EmptyState
          icon={Dumbbell}
          title={tEmpty(`${kind}.globalNoMatch`, { query: debouncedSearch })}
          description={tEmpty("globalNoMatchHint")}
          action={
            <Button variant="outline" size="sm" onClick={() => setSource("mine")}>
              {tEmpty("searchMine")}
            </Button>
          }
        />
      );
    }
    return <EmptyState icon={Dumbbell} title={t("empty")} />;
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
            <SourceFilter value={source} onChange={setSource} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search")}
              className="sm:w-56"
            />
            <ViewSwitcher value={view} onChange={setView} />
            {tab === "exercises" ? (
              <AddExerciseDialog locale={locale} onCreated={invalidate} />
            ) : (
              <AddFoodDialog locale={locale} onCreated={invalidate} />
            )}
          </div>
        </div>

        <TabsContent value="exercises" className="mt-4">
          {exercises.length === 0 ? (
            renderEmpty("exercises")
          ) : view === "list" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("tabs.exercises")}</TableHead>
                  <TableHead />
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {exercises.map((ex) => (
                  <TableRow key={ex.id}>
                    <TableCell className="font-medium">
                      {pickLocale(ex, locale)}
                      <span className="ms-2 text-sm text-muted-foreground">
                        {[ex.muscle_group, ex.equipment].filter(Boolean).join(" · ")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ex.coach_id ? "secondary" : "outline"}>
                        {ex.coach_id ? t("mine") : t("official")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {ex.coach_id && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("delete")}
                          onClick={() => setPendingDelete({ kind: "exercise", id: ex.id })}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : view === "card" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {exercises.map((ex) => (
                <ExerciseCard
                  key={ex.id}
                  exercise={ex}
                  locale={locale}
                  onDelete={() => setPendingDelete({ kind: "exercise", id: ex.id })}
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
                  onDelete={() => setPendingDelete({ kind: "exercise", id: ex.id })}
                />
              )}
              emptyLabel={t("empty")}
            />
          )}
        </TabsContent>

        <TabsContent value="foods" className="mt-4">
          {foods.length === 0 ? (
            renderEmpty("foods")
          ) : view === "list" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("tabs.foods")}</TableHead>
                  <TableHead>{t("food.kcal")}</TableHead>
                  <TableHead />
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {foods.map((food) => (
                  <TableRow key={food.id}>
                    <TableCell className="font-medium">
                      {pickLocale(food, locale)}
                      <span className="ms-2 text-sm text-muted-foreground">{food.serving_label}</span>
                    </TableCell>
                    <TableCell className="tabular-nums">{food.kcal}</TableCell>
                    <TableCell>
                      <Badge variant={food.coach_id ? "secondary" : "outline"}>
                        {food.coach_id ? t("mine") : t("official")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {food.coach_id && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("delete")}
                          onClick={() => setPendingDelete({ kind: "food", id: food.id })}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : view === "card" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {foods.map((food) => (
                <FoodCard
                  key={food.id}
                  food={food}
                  locale={locale}
                  onDelete={() => setPendingDelete({ kind: "food", id: food.id })}
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
                  onDelete={() => setPendingDelete({ kind: "food", id: food.id })}
                />
              )}
              emptyLabel={t("empty")}
            />
          )}
        </TabsContent>
      </Tabs>

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
