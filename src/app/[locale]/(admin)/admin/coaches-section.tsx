"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Columns3, LayoutGrid, List, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Segmented } from "@/components/ui/segmented";
import { usePathname, useRouter } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { CoachCompactCard, CoachesCards } from "./coaches-cards";
import { CoachesKanban } from "./coaches-kanban";
import { CoachesList } from "./coaches-list";
import type { CoachView, CoachesViewMode } from "./types";

const PAGE_SIZE = 10;

const FILTERS = ["attention", "all", "trial", "pastDue", "cancelled", "starter", "pro", "elite"] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABEL = {
  attention: "atRisk",
  all: "all",
  trial: "trialing",
  pastDue: "pastDue",
  cancelled: "cancelled",
  starter: "starter",
  pro: "pro",
  elite: "elite",
} as const;

function matches(coach: CoachView, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "attention") return coach.attention;
  if (filter === "trial" || filter === "pastDue" || filter === "cancelled") return coach.stage === filter;
  // A cancelled coach still has a tier on file but isn't on the plan any more.
  return coach.tier === filter && coach.stage !== "cancelled";
}

const num = (chunks: React.ReactNode) => <span className="font-mono tabular-nums">{chunks}</span>;

export function CoachesSection({
  locale,
  coaches,
  view: initialView,
}: {
  locale: AppLocale;
  coaches: CoachView[];
  view: CoachesViewMode;
}) {
  const t = useTranslations("admin.coaches");
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  // The URL (?view=) is the source of truth; optimistic so the view switches
  // on click instead of after the server round trip (same as clients-table).
  const [view, setView] = useOptimistic(initialView);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("attention");
  const [page, setPage] = useState(1);

  function pickView(next: CoachesViewMode) {
    startTransition(() => {
      setView(next);
      const params = new URLSearchParams(window.location.search);
      if (next === "list") params.delete("view");
      else params.set("view", next);
      const search = params.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    });
  }

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f, coaches.filter((c) => matches(c, f)).length])) as Record<Filter, number>,
    [coaches]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return coaches
      .filter((c) => matches(c, filter))
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          (c.owner ?? "").toLowerCase().includes(q) ||
          (c.phone ?? "").includes(q) ||
          c.id.includes(q)
      );
  }, [coaches, filter, query]);

  // Kanban shows every match: its lanes are the grouping, a page boundary
  // through the middle of them would hide coaches from the lane totals.
  const paged = view !== "kanban";
  const shown = paged ? filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : filtered;

  return (
    <section aria-labelledby="coaches-heading" className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5">
        <h2 id="coaches-heading" className="text-xl leading-7 font-semibold">
          {t("title")}
        </h2>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Segmented
            value={view}
            onChange={pickView}
            label={t("view.label")}
            options={[
              { value: "list", label: t("view.list"), icon: List },
              { value: "cards", label: t("view.cards"), icon: LayoutGrid },
              { value: "kanban", label: t("view.kanban"), icon: Columns3 },
            ]}
          />
          <div className="relative min-w-0 flex-[1_1_240px]">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder={t("search")}
              aria-label={t("search")}
              className="h-10 ps-9"
            />
          </div>
        </div>
      </div>

      <div role="group" aria-label={t("filterLabel")} className="flex gap-1.5 overflow-x-auto px-4 py-3 md:flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => {
              setFilter(f);
              setPage(1);
            }}
            className="flex h-8.5 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
          >
            <span dir={f === "starter" || f === "pro" || f === "elite" ? "ltr" : undefined}>
              {t(`segments.${FILTER_LABEL[f]}`)}
            </span>
            <span className="font-mono text-xs tabular-nums">{formatNumber(counts[f], locale)}</span>
          </button>
        ))}
      </div>

      {coaches.length === 0 ? (
        <EmptyState brandMark title={t("empty")} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t("noResults")}
          description={t("noResultsHint")}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setFilter("all");
                setQuery("");
                setPage(1);
              }}
            >
              {t("showAll")}
            </Button>
          }
        />
      ) : view === "kanban" ? (
        <CoachesKanban locale={locale} coaches={shown} />
      ) : view === "cards" ? (
        <CoachesCards locale={locale} coaches={shown} />
      ) : (
        <>
          <div className="hidden md:block">
            <CoachesList locale={locale} coaches={shown} />
          </div>
          <div className="flex flex-col gap-2.5 px-4 pb-4 md:hidden">
            {shown.map((coach) => (
              <CoachCompactCard key={coach.id} locale={locale} coach={coach} />
            ))}
          </div>
        </>
      )}

      {filtered.length > 0 && (
        <div className="border-t border-border px-4 py-3 text-muted-foreground">
          {filtered.length > PAGE_SIZE && paged ? (
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
          ) : (
            t.rich("shown", {
              shown: formatNumber(filtered.length, locale),
              total: formatNumber(coaches.length, locale),
              num,
            })
          )}
        </div>
      )}
    </section>
  );
}
