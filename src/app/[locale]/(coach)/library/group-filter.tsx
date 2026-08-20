"use client";

import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MUSCLE_GROUPS, FOOD_CATEGORIES } from "@/domain/library/taxonomy";

const ALL = "all";

/** Server-side narrowing by muscle_group/category, alongside search and
 * source — the one thing standing between a coach and 1,300+ rows besides
 * free-text search. `null` (the "all" sentinel) means no group filter. */
export function GroupFilter({
  kind,
  value,
  onChange,
}: {
  kind: "exercises" | "foods";
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const t = useTranslations("library.filters");
  const tGroups = useTranslations("library.muscleGroups");
  const tCategories = useTranslations("library.foodCategories");

  const options = kind === "exercises" ? MUSCLE_GROUPS : FOOD_CATEGORIES;
  const label = kind === "exercises" ? t("group") : t("category");
  const allLabel = kind === "exercises" ? t("allGroups") : t("allCategories");

  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? null : v)}>
      <SelectTrigger aria-label={label} className="sm:w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {kind === "exercises" ? tGroups(option) : tCategories(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
