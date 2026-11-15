"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { LibraryBig, Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import type { AppLocale } from "@/domain/locale";
import {
  facets,
  filterTemplates,
  NO_FILTERS,
  type LibraryFilters,
  type LibraryRow,
} from "@/domain/programs/platform/library-view";
import { useEquipmentLabel } from "../../library/equipment-filter";
import { TemplateCard } from "./template-card";

/** One filter row: an "All" chip plus one per value present in the data. */
function Chips({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  onChange: (v: string | null) => void;
}) {
  const t = useTranslations("programs.library.filters");
  if (options.length === 0) return null;
  const chip =
    "h-8 rounded-full border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-transparent aria-pressed:bg-primary aria-pressed:text-primary-foreground";
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="me-1 text-sm text-muted-foreground">{label}</span>
      <button type="button" aria-pressed={value === null} onClick={() => onChange(null)} className={chip}>
        {t("all")}
      </button>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(value === o.value ? null : o.value)}
          className={chip}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function LibraryClient({ locale, rows }: { locale: AppLocale; rows: LibraryRow[] }) {
  const t = useTranslations("programs.library");
  const tFilters = useTranslations("programs.library.filters");
  const tLevels = useTranslations("programs.levels");
  const equipmentLabel = useEquipmentLabel();
  const [filters, setFilters] = useState<LibraryFilters>(NO_FILTERS);

  const available = useMemo(() => facets(rows), [rows]);
  const shown = useMemo(() => filterTemplates(rows, filters), [rows, filters]);
  const set = (patch: Partial<LibraryFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const filtering = filters.q.trim() !== "" || !!filters.category || !!filters.level || !!filters.equipment;

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState icon={LibraryBig} title={t("empty.title")} description={t("empty.description")} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="relative min-w-0 max-w-md">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="ps-9"
          />
        </div>
        <Chips
          label={tFilters("category")}
          value={filters.category}
          options={available.categories.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
          onChange={(category) => set({ category })}
        />
        <Chips
          label={tFilters("level")}
          value={filters.level}
          options={available.levels.map((l) => ({ value: l, label: tLevels(l as "beginner") }))}
          onChange={(level) => set({ level })}
        />
        <Chips
          label={tFilters("equipment")}
          value={filters.equipment}
          options={available.equipment.map((e) => ({ value: e, label: equipmentLabel(e) ?? e }))}
          onChange={(equipment) => set({ equipment })}
        />
        {filtering && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span aria-live="polite">{t("results", { count: shown.length })}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setFilters(NO_FILTERS)}>
              {tFilters("clear")}
            </Button>
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title={t("noResults.title")}
            description={t("noResults.description")}
            action={
              <Button type="button" variant="outline" onClick={() => setFilters(NO_FILTERS)}>
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
    </div>
  );
}
