"use client";

import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowUpCircle, Dumbbell, Pencil, Trash2 } from "lucide-react";
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
import type { LibrarySource } from "@/domain/library/library.service";
import { SourceFilter } from "@/app/[locale]/(coach)/library/source-filter";
import {
  adminSearchExercisesAction,
  adminSearchFoodsAction,
  deleteGlobalExerciseAction,
  deleteGlobalFoodAction,
  promoteExerciseAction,
  promoteFoodAction,
} from "./actions";
import { GlobalExerciseDialog } from "./global-exercise-dialog";

type ExercisePage = Awaited<ReturnType<typeof adminSearchExercisesAction>>;
type FoodPage = Awaited<ReturnType<typeof adminSearchFoodsAction>>;
type Exercise = ExercisePage["rows"][number];

type Pending = { kind: "exercise" | "food"; id: string };

const PAGE_SIZE = 24;

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
  const [tab, setTab] = useState<"exercises" | "foods">("exercises");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<LibrarySource>("all");
  const [pageExercise, setPageExercise] = useState(1);
  const [pageFood, setPageFood] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<Pending | null>(null);
  const [pendingPromote, setPendingPromote] = useState<Pending | null>(null);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);
  const queryClient = useQueryClient();

  function updateSearch(value: string) {
    setSearch(value);
    setPageExercise(1);
    setPageFood(1);
  }

  function updateSource(value: LibrarySource) {
    setSource(value);
    setPageExercise(1);
    setPageFood(1);
  }

  const isDefaultExercises = debouncedSearch === "" && source === "all" && pageExercise === 1;
  const isDefaultFoods = debouncedSearch === "" && source === "all" && pageFood === 1;

  const exercisesQuery = useQuery({
    queryKey: ["admin-library", "exercises", debouncedSearch, source, pageExercise],
    queryFn: () =>
      adminSearchExercisesAction({ query: debouncedSearch, source, page: pageExercise, pageSize: PAGE_SIZE }),
    initialData: isDefaultExercises ? initialExercises : undefined,
    placeholderData: keepPreviousData,
  });

  const foodsQuery = useQuery({
    queryKey: ["admin-library", "foods", debouncedSearch, source, pageFood],
    queryFn: () =>
      adminSearchFoodsAction({ query: debouncedSearch, source, page: pageFood, pageSize: PAGE_SIZE }),
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
              className="sm:w-56"
            />
            {tab === "exercises" && <GlobalExerciseDialog locale={locale} onSaved={invalidate} />}
          </div>
        </div>

        <TabsContent value="exercises" className="mt-4 flex flex-col gap-3">
          {exercises.length === 0 ? (
            <EmptyState icon={Dumbbell} title={emptyTitle} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("tabs.exercises")}</TableHead>
                  <TableHead>{tAdmin("owner")}</TableHead>
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
                        {ex.coach_id ? tAdmin("coachOwner") : tAdmin("globalOwner")}
                      </Badge>
                    </TableCell>
                    <TableCell className="flex justify-end gap-1">
                      {/* A coach-owned row is read-only here: admin_update_global
                          is qualified `coach_id is null`, so the only write an
                          admin has on it is promotion. */}
                      {ex.coach_id ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingPromote({ kind: "exercise", id: ex.id })}
                        >
                          <ArrowUpCircle className="size-4" />
                          {tAdmin("promote")}
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={tAdmin("edit")}
                            onClick={() => setEditing(ex)}
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
                ))}
              </TableBody>
            </Table>
          )}
          <Pagination
            page={pageExercise}
            pageSize={PAGE_SIZE}
            total={exercisesTotal}
            onPageChange={setPageExercise}
            disabled={exercisesQuery.isFetching}
          />
        </TabsContent>

        <TabsContent value="foods" className="mt-4 flex flex-col gap-3">
          {foods.length === 0 ? (
            <EmptyState icon={Dumbbell} title={emptyTitle} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("tabs.foods")}</TableHead>
                  <TableHead>{t("food.kcal")}</TableHead>
                  <TableHead>{tAdmin("owner")}</TableHead>
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
                        {food.coach_id ? tAdmin("coachOwner") : tAdmin("globalOwner")}
                      </Badge>
                    </TableCell>
                    <TableCell className="flex justify-end gap-1">
                      {food.coach_id ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingPromote({ kind: "food", id: food.id })}
                        >
                          <ArrowUpCircle className="size-4" />
                          {tAdmin("promote")}
                        </Button>
                      ) : (
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
          )}
          <Pagination
            page={pageFood}
            pageSize={PAGE_SIZE}
            total={foodsTotal}
            onPageChange={setPageFood}
            disabled={foodsQuery.isFetching}
          />
        </TabsContent>
      </Tabs>

      {editing && (
        <GlobalExerciseDialog
          // key remounts the form so defaultValues track the selected row.
          key={editing.id}
          locale={locale}
          exercise={editing}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.success(tAdmin("updated"));
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
