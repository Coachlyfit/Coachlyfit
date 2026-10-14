"use client";

import { useState, useTransition } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChefHat, Plus, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pagination } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link, useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/domain/locale";
import { recipeQuery, type LibraryParams } from "@/domain/library/library-params";
import { RECIPE_SORTS, type RecipeSort } from "@/domain/recipes/recipes.service";
import {
  deleteRecipeAction,
  duplicateRecipeAction,
  recipeTagsAction,
  searchRecipesAction,
  type RecipeCardRow,
} from "./recipes/actions";
import { RecipeCard } from "./recipe-card";
import { CardGridSkeleton } from "@/components/ui/card-grid-skeleton";

type RecipePage = Awaited<ReturnType<typeof searchRecipesAction>>;

const ALL_TAGS = "__all__";

/** Sort + tag controls for the library's shared filter row. */
export function RecipeFilters({
  params,
  onChange,
}: {
  params: LibraryParams;
  onChange: (patch: Partial<Pick<LibraryParams, "sort" | "tag">>) => void;
}) {
  const t = useTranslations("recipes");
  const { data: tags = [] } = useQuery({ queryKey: ["library", "recipe-tags"], queryFn: () => recipeTagsAction() });

  return (
    <>
      {tags.length > 0 && (
        <Select
          value={params.tag ?? ALL_TAGS}
          onValueChange={(v) => onChange({ tag: v === ALL_TAGS || v == null ? null : String(v) })}
          items={[{ value: ALL_TAGS, label: t("tags.all") }, ...tags.map((tag) => ({ value: tag, label: tag }))]}
        >
          <SelectTrigger aria-label={t("tags.label")} className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TAGS}>{t("tags.all")}</SelectItem>
            {tags.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select
        value={params.sort}
        onValueChange={(v) => onChange({ sort: (v as RecipeSort | null) ?? "newest" })}
        items={RECIPE_SORTS.map((s) => ({ value: s, label: t(`sort.${s}`) }))}
      >
        <SelectTrigger aria-label={t("sort.label")} className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RECIPE_SORTS.map((s) => (
            <SelectItem key={s} value={s}>
              {t(`sort.${s}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

export function NewRecipeButton() {
  const t = useTranslations("recipes");
  return (
    <Button size="sm" nativeButton={false} render={<Link href="/library/recipes/new" />}>
      <Plus className="size-4" />
      {t("new")}
    </Button>
  );
}

/** The library's Recipes tab: a card grid only (recipes have no list or
 * kanban view). URL state comes from LibraryClient. */
export function RecipesTab({
  locale,
  params,
  initialRecipes,
  onPage,
  onClearFilters,
}: {
  locale: AppLocale;
  params: LibraryParams;
  /** Server-rendered first page, only when it matches `params`. */
  initialRecipes: RecipePage | null;
  onPage: (page: number) => void;
  onClearFilters: () => void;
}) {
  const t = useTranslations("recipes");
  const tErrors = useTranslations("recipes.errors");
  const queryClient = useQueryClient();
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = useState<RecipeCardRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const query = useQuery({
    queryKey: ["library", "recipes", params.q, params.tag, params.sort, params.page],
    queryFn: () => searchRecipesAction(recipeQuery(params, locale)),
    initialData: initialRecipes ?? undefined,
    placeholderData: keepPreviousData,
  });

  function reportError(key: string) {
    toast.error(tErrors.has(key) ? tErrors(key) : tErrors("unknown"));
  }

  function duplicate(recipe: RecipeCardRow) {
    setBusyId(recipe.id);
    startTransition(async () => {
      try {
        const result = await duplicateRecipeAction(locale, recipe.id);
        if ("error" in result) return reportError(result.error);
        toast.success(t("duplicated"));
        queryClient.invalidateQueries({ queryKey: ["library", "recipes"] });
        router.push(`/library/recipes/${result.id}`);
      } catch {
        reportError("network");
      } finally {
        setBusyId(null);
      }
    });
  }

  function confirmDelete() {
    const recipe = pendingDelete;
    if (!recipe) return;
    setPendingDelete(null);
    setBusyId(recipe.id);
    startTransition(async () => {
      try {
        const result = await deleteRecipeAction(locale, recipe.id);
        if ("error" in result) return reportError(result.error);
        toast.success(result.outcome === "archived" ? t("delete.archived") : t("delete.deleted"));
        queryClient.invalidateQueries({ queryKey: ["library", "recipes"] });
        queryClient.invalidateQueries({ queryKey: ["library", "recipe-tags"] });
      } catch {
        reportError("network");
      } finally {
        setBusyId(null);
      }
    });
  }

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const page = query.isPlaceholderData ? params.page : (query.data?.page ?? params.page);
  const narrowed = params.q !== "" || params.tag !== null;

  let body: React.ReactNode;
  if (query.isPending) {
    body = <CardGridSkeleton count={6} />;
  } else if (query.isError) {
    body = (
      <EmptyState
        icon={SearchX}
        title={t("loadFailed")}
        action={
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            {t("retry")}
          </Button>
        }
      />
    );
  } else if (rows.length === 0) {
    body = narrowed ? (
      <EmptyState
        icon={SearchX}
        title={t("empty.noResults")}
        description={t("empty.noResultsHint")}
        action={
          <Button variant="outline" size="sm" onClick={onClearFilters}>
            {t("empty.clear")}
          </Button>
        }
      />
    ) : (
      <EmptyState icon={ChefHat} title={t("empty.none")} description={t("empty.noneHint")} action={<NewRecipeButton />} />
    );
  } else {
    body = (
      <div
        className={`grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 transition-opacity ${query.isFetching ? "opacity-60" : ""}`}
      >
        {rows.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            locale={locale}
            busy={busyId === recipe.id}
            onDuplicate={() => duplicate(recipe)}
            onDelete={() => setPendingDelete(recipe)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {body}
      {total > 0 && (
        <Pagination page={page} pageSize={24} total={total} onPageChange={onPage} disabled={query.isFetching} />
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t("delete.title")}
        description={
          pendingDelete && pendingDelete.plan_count > 0
            ? t("delete.bodyUsed", { count: pendingDelete.plan_count })
            : t("delete.bodyUnused")
        }
        confirmLabel={t("delete.confirm")}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
