"use client";

import { useTranslations } from "next-intl";
import { ChefHat, Clock, Copy, Pencil, PlayCircle, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatNumber } from "@/lib/format";
import type { RecipeCardRow } from "./recipes/actions";
import { FOOD_MACROS } from "./food-card";

/** One recipe in the library grid. Macros are per serving, from
 * recipes_with_macros. Actions are inline icon buttons, same as FoodCard. */
export function RecipeCard({
  recipe,
  locale,
  busy,
  onDuplicate,
  onDelete,
}: {
  recipe: RecipeCardRow;
  locale: AppLocale;
  busy?: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("recipes.card");
  const tMacros = useTranslations("diets.macros");
  const name = pickLocale(recipe, locale);

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Link
        href={`/library/recipes/${recipe.id}`}
        className="relative block aspect-video bg-muted"
        tabIndex={-1}
        aria-hidden="true"
      >
        {recipe.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL; next/image would cache it
          <img src={recipe.image_url} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center">
            <ChefHat className="size-10 text-muted-foreground/50" aria-hidden="true" />
          </span>
        )}
        {recipe.video_url && (
          <span className="absolute end-2 top-2 rounded-full bg-background/90 p-1" title={t("hasVideo")}>
            <PlayCircle className="size-4" aria-label={t("hasVideo")} />
          </span>
        )}
      </Link>
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-semibold">
            <Link href={`/library/recipes/${recipe.id}`} className="hover:underline">
              {name}
            </Link>
          </h3>
          {recipe.total_minutes > 0 && (
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3.5" aria-hidden="true" />
              {t("minutes", { count: recipe.total_minutes })}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-sm tabular-nums">
            <span className="font-semibold">{formatNumber(Math.round(recipe.kcal), locale)}</span>{" "}
            <span className="text-muted-foreground">
              {tMacros("kcal")} · {t("perServing")}
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FOOD_MACROS.map(({ key, field, color }) => (
              <span
                key={key}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums"
              >
                <span className={`size-1.5 rounded-full ${color}`} aria-hidden="true" />
                {tMacros(key === "protein" ? "p" : key === "carbs" ? "c" : "f")} {Math.round(recipe[field])}
              </span>
            ))}
          </div>
        </div>

        {(recipe.tags.length > 0 || recipe.plan_count > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {recipe.plan_count > 0 && <Badge variant="info">{t("usedIn", { count: recipe.plan_count })}</Badge>}
            {recipe.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="mt-auto flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            render={<Link href={`/library/recipes/${recipe.id}`} />}
            aria-label={t("edit")}
            title={t("edit")}
          >
            <Pencil className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onDuplicate} disabled={busy} aria-label={t("duplicate")} title={t("duplicate")}>
            <Copy className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            disabled={busy}
            aria-label={t("delete")}
            title={t("delete")}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
