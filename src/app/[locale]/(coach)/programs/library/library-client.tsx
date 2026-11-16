"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { LibraryBig, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { AppLocale } from "@/domain/locale";
import {
  facets,
  filterTemplates,
  NO_FILTERS,
  parseLibraryFilters,
  pruneFilters,
  sortTemplates,
  writeLibraryFilters,
  type LibraryFilters,
  type LibraryRow,
  type LibrarySort,
  type TemplateKind,
} from "@/domain/programs/platform/library-view";
import { useEquipmentLabel } from "../../library/equipment-filter";
import { FiltersBar, type FilterGroup } from "./filters-bar";
import { TemplateCard } from "./template-card";

type ListKey = "category" | "level" | "equipment" | "goal" | "gender";
type GroupKey = ListKey | "duration";

const SEARCH_DEBOUNCE_MS = 300;
const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function LibraryClient({
  locale,
  kind,
  rows,
}: {
  locale: AppLocale;
  kind: TemplateKind;
  rows: LibraryRow[];
}) {
  const t = useTranslations("programs.library");
  const tFilters = useTranslations("programs.library.filters");
  const tLevels = useTranslations("programs.levels");
  const tGoals = useTranslations("programs.goals");
  const equipmentLabel = useEquipmentLabel();

  // The URL is the source of truth, so filters survive a refresh and can be shared. Each tab has its own keys.
  const searchParams = useSearchParams();
  const available = useMemo(() => facets(rows), [rows]);
  const { filters, sort } = useMemo(() => {
    const parsed = parseLibraryFilters(new URLSearchParams(searchParams.toString()), kind);
    return { filters: pruneFilters(parsed.filters, available), sort: parsed.sort };
  }, [searchParams, kind, available]);

  // The input stays local so typing is instant; the URL follows once the coach pauses.
  const [q, setQ] = useState(filters.q);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  /** Rewrites this tab's params in place (no server round trip: rows are already here). Reads the live URL
   * so a debounced or rapid second call can't write back stale filters. */
  function update(change: (cur: LibraryFilters) => LibraryFilters, nextSort?: LibrarySort) {
    const live = new URLSearchParams(window.location.search);
    const cur = parseLibraryFilters(live, kind);
    const query = writeLibraryFilters(live, kind, change(cur.filters), nextSort ?? cur.sort);
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }

  function onQ(value: string) {
    setQ(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => update((cur) => ({ ...cur, q: value })), SEARCH_DEBOUNCE_MS);
  }

  function onToggle(group: string, value: string) {
    update((cur) => {
      const next = { ...cur };
      if ((group as GroupKey) === "duration") next.duration = toggleIn(cur.duration, Number(value));
      else next[group as ListKey] = toggleIn(cur[group as ListKey], value);
      return next;
    });
  }

  function onClearGroup(group: string) {
    update((cur) => {
      const next = { ...cur };
      if ((group as GroupKey) === "duration") next.duration = [];
      else next[group as ListKey] = [];
      return next;
    });
  }

  function clearAll() {
    clearTimeout(searchTimer.current);
    setQ("");
    update(() => NO_FILTERS);
  }

  const shown = useMemo(() => sortTemplates(filterTemplates(rows, filters), sort, locale), [rows, filters, sort, locale]);

  /** Results if this option were the only pick in its group (the other groups and the search still apply). */
  const countFor = (key: GroupKey, value: string) => {
    const f = { ...filters };
    if (key === "duration") f.duration = [Number(value)];
    else f[key] = [value];
    return filterTemplates(rows, f).length;
  };
  const group = (key: GroupKey, values: (string | number)[], label: (v: string) => string): FilterGroup => ({
    key,
    label: tFilters(key),
    selected: filters[key].map(String),
    options: values.map((v) => ({ value: String(v), label: label(String(v)), count: countFor(key, String(v)) })),
  });

  const levels = group("level", available.levels, (l) => tLevels(l as "beginner"));
  const groups: FilterGroup[] = (
    kind === "plan"
      ? [
          group("goal", available.goals, (g) => tGoals(g as "muscle")),
          group("gender", available.genders, (g) => t(`genders.${g}` as "genders.male")),
          levels,
          group("duration", available.durations, (d) => t("card.weeks", { count: Number(d) })),
        ]
      : [
          group("category", available.categories, (c) => t(`categories.${c}` as "categories.core")),
          levels,
          group("equipment", available.equipment, (e) => equipmentLabel(e) ?? e),
        ]
  ).filter((g) => g.options.length > 0);

  return (
    <div className="flex flex-col gap-5">
      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={LibraryBig}
            title={kind === "plan" ? t("emptyPlans.title") : t("empty.title")}
            description={kind === "plan" ? t("emptyPlans.description") : t("empty.description")}
          />
        </Card>
      ) : (
        <>
          <FiltersBar
            locale={locale}
            kind={kind}
            groups={groups}
            q={q}
            onQ={onQ}
            sort={sort}
            onSort={(next) => update((cur) => cur, next)}
            onToggle={onToggle}
            onClearGroup={onClearGroup}
            onClearAll={clearAll}
            resultCount={shown.length}
          />

          {shown.length === 0 ? (
            <Card>
              <EmptyState
                icon={SearchX}
                title={t("noResults.title")}
                description={t("noResults.description")}
                action={
                  <Button type="button" variant="outline" onClick={clearAll}>
                    {tFilters("clear")}
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((row) => (
                <TemplateCard key={row.id} locale={locale} row={row} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
