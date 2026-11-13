"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, LayoutGrid, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PLAN_TYPES } from "@/domain/programs/plan-meta";
import { usePathname, useRouter } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import type { ProgramScope } from "@/domain/programs/programs.service";
import {
  ProgramCard,
  TemplateCard,
  WeekLegend,
  type AssignedRow,
  type ClientOption,
  type TemplateRow,
} from "./program-cards";
import { WeekView } from "./week-view";

export type ProgramsView = "cards" | "week";

const SCOPES = ["all", "assigned", "templates"] as const satisfies readonly ProgramScope[];
const ALL_TYPES = "__all__";
const SCOPE_LABEL = { all: "allTab", assigned: "assignedTab", templates: "templatesTab" } as const;

export function ProgramsClient({
  locale,
  view,
  scope,
  week,
  weekStart,
  today,
  assigned,
  templates,
  clients,
}: {
  locale: AppLocale;
  view: ProgramsView;
  scope: ProgramScope;
  /** The ?week= value to keep in links; null while on the current week. */
  week: string | null;
  weekStart: string;
  today: string;
  assigned: AssignedRow[];
  templates: TemplateRow[];
  clients: ClientOption[];
}) {
  const t = useTranslations("programs");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  // The URL is the source of truth; optimistic so the toggle and tabs switch
  // on click instead of after the server round trip.
  const [state, setState] = useOptimistic({ view, scope });
  const [query, setQuery] = useState("");
  // Client-side like the text search: the whole (small) program list is already here.
  const [planType, setPlanType] = useState<string>(ALL_TYPES);
  const tTypes = useTranslations("programs.planTypes");

  function href(next: { view?: ProgramsView; scope?: ProgramScope; week?: string | null }) {
    const merged = { ...state, week, ...next };
    const params = new URLSearchParams();
    if (merged.view !== "cards") params.set("view", merged.view);
    if (merged.scope !== "all") params.set("scope", merged.scope);
    // Only the week view navigates weeks; cards always show the current one.
    if (merged.week && merged.view === "week") params.set("week", merged.week);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function go(next: { view?: ProgramsView; scope?: ProgramScope }) {
    startTransition(() => {
      setState({ ...state, ...next });
      router.replace(href(next), { scroll: false });
    });
  }

  const q = query.trim().toLowerCase();
  const shownAssigned = useMemo(
    () =>
      assigned.filter(
        (p) =>
          (planType === ALL_TYPES || p.planType === planType) &&
          (!q || p.name.toLowerCase().includes(q) || p.client.toLowerCase().includes(q))
      ),
    [assigned, q, planType]
  );
  const shownTemplates = useMemo(
    () => templates.filter((p) => (planType === ALL_TYPES || p.planType === planType) && (!q || p.name.toLowerCase().includes(q))),
    [templates, q, planType]
  );
  // Same "latest program is the active one" rule as getActiveTreeForClient;
  // `assigned` arrives newest first.
  const weekRows = useMemo(() => {
    const seen = new Set<string>();
    return assigned.filter((p) => !seen.has(p.clientId) && seen.add(p.clientId));
  }, [assigned]);

  const counts: Record<ProgramScope, number> = {
    all: assigned.length + templates.length,
    assigned: assigned.length,
    templates: templates.length,
  };
  const showAssigned = state.scope !== "templates" && shownAssigned.length > 0;
  const showTemplates = state.scope !== "assigned" && shownTemplates.length > 0;

  return (
    <div className={cn("flex flex-col gap-5 transition-opacity", pending && "opacity-70")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {state.view === "cards" && (
          <div
            role="tablist"
            aria-label={t("tabsLabel")}
            className="flex gap-1 rounded-[11px] bg-muted p-1 max-sm:w-full"
          >
            {SCOPES.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={state.scope === key}
                onClick={() => go({ scope: key })}
                className="h-9.5 rounded-lg px-3.5 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-selected:bg-card aria-selected:shadow-xs max-sm:flex-1"
              >
                {t(SCOPE_LABEL[key])}{" "}
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {formatNumber(counts[key], locale)}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="ms-auto flex flex-wrap items-center gap-3 max-sm:w-full">
          {state.view === "cards" && (
            <div className="relative min-w-0 flex-[1_1_260px]">
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
                className="ps-9"
              />
            </div>
          )}
          {state.view === "cards" && (
            <Select
              value={planType}
              onValueChange={(v) => setPlanType(v ?? ALL_TYPES)}
              items={[
                { value: ALL_TYPES, label: t("planMeta.allTypes") },
                ...PLAN_TYPES.map((p) => ({ value: p, label: tTypes(p) })),
              ]}
            >
              <SelectTrigger aria-label={t("planMeta.planType")} className="sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TYPES}>{t("planMeta.allTypes")}</SelectItem>
                {PLAN_TYPES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {tTypes(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Segmented
            value={state.view}
            onChange={(next) => go({ view: next })}
            label={t("view.label")}
            options={[
              { value: "cards", label: t("view.cards"), icon: LayoutGrid },
              { value: "week", label: t("view.week"), icon: CalendarDays },
            ]}
          />
        </div>
      </div>

      {state.view === "week" ? (
        <WeekView
          // Remount on week change so the mobile day picker resets to today.
          key={weekStart}
          locale={locale}
          rows={weekRows}
          templates={templates}
          clients={clients}
          weekStart={weekStart}
          today={today}
          weekHref={(next) => href({ view: "week", week: next })}
          templatesHref={href({ view: "cards", scope: "templates" })}
        />
      ) : (
        <>
          {showAssigned && (
            <section aria-labelledby="programs-assigned" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="programs-assigned" className="text-xl leading-7 font-semibold">
                  {t("sections.clientPrograms")}
                </h2>
                <WeekLegend />
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-4">
                {shownAssigned.map((row) => (
                  <ProgramCard key={row.id} locale={locale} row={row} today={today} clients={clients} />
                ))}
              </div>
            </section>
          )}
          {showTemplates && (
            <section aria-labelledby="programs-templates" className="flex flex-col gap-3">
              <div>
                <h2 id="programs-templates" className="text-xl leading-7 font-semibold">
                  {t("sections.templates")}
                </h2>
                <span className="text-muted-foreground">{t("sections.templatesHint")}</span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-4">
                {shownTemplates.map((row) => (
                  <TemplateCard key={row.id} locale={locale} row={row} clients={clients} />
                ))}
              </div>
            </section>
          )}
          {!showAssigned && !showTemplates && (
            <Card>
              <EmptyState brandMark title={t("noResults")} description={t("noResultsHint")} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
