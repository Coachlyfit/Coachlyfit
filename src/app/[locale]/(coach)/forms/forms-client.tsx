"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import type { FormKind } from "@/domain/forms/schema";
import { FormCard, type ClientOption, type FormRow } from "./form-card";

export type KindFilter = FormKind | "all";

const FILTERS = ["all", "intake", "checkin", "workout", "diet", "custom"] as const satisfies readonly KindFilter[];

export function FormsClient({
  locale,
  kind,
  forms,
  clients,
  canCreate,
}: {
  locale: AppLocale;
  kind: KindFilter;
  forms: FormRow[];
  clients: ClientOption[];
  /** Whether the plan includes the forms builder (new and duplicated forms). */
  canCreate: boolean;
}) {
  const t = useTranslations("forms.list");
  const tKinds = useTranslations("forms.kinds");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  // The URL is the source of truth; optimistic so a chip switches on click
  // instead of after the server round trip.
  const [active, setActive] = useOptimistic(kind);
  const [query, setQuery] = useState("");

  function go(next: KindFilter) {
    startTransition(() => {
      setActive(next);
      router.replace(next === "all" ? pathname : `${pathname}?kind=${next}`, { scroll: false });
    });
  }

  const count = (key: KindFilter) => (key === "all" ? forms.length : forms.filter((f) => f.kind === key).length);
  const q = query.trim().toLowerCase();
  const shown = forms.filter(
    (f) =>
      (active === "all" || f.kind === active) &&
      (!q || f.name_ar.toLowerCase().includes(q) || f.name_en.toLowerCase().includes(q))
  );

  return (
    <div className={cn("flex flex-col gap-5 transition-opacity", pending && "opacity-70")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* -mx/px: the row scrolls edge to edge on mobile instead of clipping
            the last chip at the page gutter. */}
        <div
          role="group"
          aria-label={t("filterLabel")}
          className="-mx-4 flex gap-1.5 overflow-x-auto px-4 py-0.5 max-sm:w-[calc(100%+2rem)] sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={active === key}
              onClick={() => go(key)}
              className="h-9.5 shrink-0 rounded-full border border-border bg-card px-3.5 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
            >
              {key === "all" ? t("all") : tKinds(key)}{" "}
              <span className="font-mono text-xs tabular-nums">{formatNumber(count(key), locale)}</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-[0_1_280px] max-sm:flex-auto">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="ps-9 max-md:h-11 max-md:text-base"
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState brandMark title={t("noResults")} description={t("noResultsHint")} />
        </Card>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-4">
          {shown.map((row) => (
            <FormCard key={row.id} locale={locale} row={row} clients={clients} canDuplicate={canCreate} />
          ))}
          {canCreate && <Link
            href="/forms/new"
            className="flex min-h-55 flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-muted-foreground/40 p-4.5 text-center outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 max-md:hidden"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-accent-tint text-accent-tint-foreground">
              <Plus className="size-5" aria-hidden="true" />
            </span>
            <span className="font-semibold">{t("newCardTitle")}</span>
            <span className="text-muted-foreground">{t("newCardHint")}</span>
          </Link>}
        </div>
      )}
    </div>
  );
}
