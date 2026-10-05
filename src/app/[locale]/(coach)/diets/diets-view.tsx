"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Copy, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import type { DietPlanScope } from "@/domain/nutrition/diet-plans.service";
import type { PlanProgress, PlanStatus } from "@/domain/nutrition/plan-status";
import { ClientAvatar } from "../dashboard/client-avatar";
import { duplicateDietPlanAction } from "./actions";
import { CreateDietPlanDialog } from "./create-diet-plan-dialog";
import { AssignDietTemplateDialog } from "./[dietPlanId]/assign-diet-template-dialog";

type PlanBase = {
  id: string;
  name: string;
  /** Lowercased plan names (both languages) + client name. */
  searchText: string;
  kcal: number | null;
  meals: number;
};

export type ClientPlanCard = PlanBase & {
  clientId: string;
  /** Null when the client's row is no longer readable (coach switch). */
  clientName: string | null;
  startDate: string;
  endDate: string | null;
  status: PlanStatus;
  progress: PlanProgress;
};

export type TemplateCard = PlanBase;

type ClientOption = { id: string; display_name: string };

const SCOPES = ["all", "assigned", "templates"] as const satisfies readonly DietPlanScope[];

// "ended" has no tone: nothing left to act on, so it stays neutral.
const STATUS_TONE: Partial<Record<PlanStatus, StatusTone>> = {
  endingSoon: "warning",
  active: "success",
  notStarted: "accent",
};

const BAR_COLOR: Record<PlanStatus, string> = {
  endingSoon: "bg-warning",
  active: "bg-primary",
  notStarted: "bg-transparent",
  ended: "bg-muted-foreground",
};

const NUMERIC_DATE = { day: "2-digit", month: "2-digit", year: "numeric" } as const;

function mono(chunks: React.ReactNode) {
  return <span className="font-mono tabular-nums">{chunks}</span>;
}

function Chips({ locale, kcal, meals }: { locale: AppLocale; kcal: number | null; meals: number }) {
  const t = useTranslations("diets.chips");
  return (
    <div className="flex flex-wrap gap-1.5">
      {kcal != null && (
        <Badge variant="secondary" className="rounded-md">
          <span>{t.rich("kcal", { value: formatNumber(kcal, locale), num: mono })}</span>
        </Badge>
      )}
      <Badge variant="secondary" className="rounded-md">
        <span>{t.rich("meals", { count: meals, value: formatNumber(meals, locale), num: mono })}</span>
      </Badge>
    </div>
  );
}

function ClientPlan({ locale, plan }: { locale: AppLocale; plan: ClientPlanCard }) {
  const t = useTranslations("diets");
  const tErrors = useTranslations("diets.errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { day, total, pct, startsIn } = plan.progress;
  const tone = STATUS_TONE[plan.status];

  function duplicate() {
    startTransition(async () => {
      const result = await duplicateDietPlanAction(locale, plan.id);
      if ("error" in result) {
        toast.error(tErrors(result.error));
        return;
      }
      router.push(`/diets/${result.id}`);
    });
  }

  return (
    <article className="flex flex-col gap-3.5 rounded-xl bg-card p-4.5 ring-1 ring-foreground/10">
      <div className="flex items-center gap-3">
        <ClientAvatar id={plan.clientId} name={plan.clientName ?? ""} />
        <div className="flex min-w-0 flex-1 flex-col leading-snug">
          <span className="truncate font-semibold">{plan.name}</span>
          <span className="truncate text-muted-foreground">{plan.clientName ?? "—"}</span>
        </div>
        {tone ? (
          <StatusBadge tone={tone}>{t(`status.${plan.status}`)}</StatusBadge>
        ) : (
          <Badge variant="secondary" className="rounded-md">
            {t(`status.${plan.status}`)}
          </Badge>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap justify-between gap-x-3">
          <span className="font-mono tabular-nums">
            {plan.endDate
              ? t("dateRange", {
                  start: formatDate(plan.startDate, locale, NUMERIC_DATE),
                  end: formatDate(plan.endDate, locale, NUMERIC_DATE),
                })
              : formatDate(plan.startDate, locale, NUMERIC_DATE)}
          </span>
          <span className="text-muted-foreground">
            {plan.status === "notStarted"
              ? t.rich("startsIn", { count: startsIn, value: formatNumber(startsIn, locale), num: mono })
              : total != null
                ? t.rich("dayOf", { day: formatNumber(day, locale), total: formatNumber(total, locale), num: mono })
                : t.rich("dayOngoing", { day: formatNumber(day, locale), num: mono })}
          </span>
        </div>
        {/* A flex row starts at the inline-start edge, so the fill grows from
            the right in RTL without a direction-specific class. The label
            above already says the same thing in text. */}
        {pct != null && (
          <div className="flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className={cn("h-full rounded-full", BAR_COLOR[plan.status])} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      <Chips locale={locale} kcal={plan.kcal} meals={plan.meals} />

      <div className="mt-auto flex gap-2 border-t border-border pt-3">
        <Link href={`/diets/${plan.id}`} className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "flex-1")}>
          {t("openPlan")}
        </Link>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={pending}
          onClick={duplicate}
          aria-label={t("duplicatePlan", { name: plan.name })}
          title={t("duplicatePlan", { name: plan.name })}
        >
          <Copy className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </article>
  );
}

function Template({ locale, plan, clients }: { locale: AppLocale; plan: TemplateCard; clients: ClientOption[] }) {
  const t = useTranslations("diets");
  return (
    <article className="flex flex-col gap-3 rounded-xl bg-card p-4.5 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-semibold">{plan.name}</span>
        <StatusBadge tone="accent">{t("template")}</StatusBadge>
      </div>
      <Chips locale={locale} kcal={plan.kcal} meals={plan.meals} />
      <div className="mt-auto flex gap-2">
        <AssignDietTemplateDialog
          locale={locale}
          dietPlanId={plan.id}
          clients={clients}
          triggerLabel={t("assignToClient")}
          triggerVariant="default"
          triggerClassName="flex-1"
        />
        <Link href={`/diets/${plan.id}`} className={buttonVariants({ variant: "outline" })}>
          {t("editTemplate")}
        </Link>
      </div>
    </article>
  );
}

export function DietsView({
  locale,
  scope: urlScope,
  clientPlans,
  templates,
  clients,
}: {
  locale: AppLocale;
  scope: DietPlanScope;
  clientPlans: ClientPlanCard[];
  templates: TemplateCard[];
  clients: ClientOption[];
}) {
  const t = useTranslations("diets");
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  // The URL (?scope=) is the source of truth; optimistic so the sections
  // switch on click instead of after the server round trip.
  const [scope, setScope] = useOptimistic(urlScope);
  const [query, setQuery] = useState("");

  function pickScope(next: DietPlanScope) {
    startTransition(() => {
      setScope(next);
      router.replace(next === "all" ? pathname : `${pathname}?scope=${next}`, { scroll: false });
    });
  }

  const counts: Record<DietPlanScope, number> = {
    all: clientPlans.length + templates.length,
    assigned: clientPlans.length,
    templates: templates.length,
  };

  const q = query.trim().toLowerCase();
  const shownPlans = useMemo(() => clientPlans.filter((p) => !q || p.searchText.includes(q)), [clientPlans, q]);
  const shownTemplates = useMemo(() => templates.filter((p) => !q || p.searchText.includes(q)), [templates, q]);

  const noResults = <EmptyState title={t("noResults")} description={t("noResultsHint")} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={t("tabsLabel")} className="inline-flex max-w-full gap-1 rounded-xl bg-muted p-1">
          {SCOPES.map((key) => (
            <Button
              key={key}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={scope === key}
              onClick={() => pickScope(key)}
              className={cn("gap-1.5", scope === key && "bg-background shadow-xs hover:bg-background")}
            >
              {t(`${key}Tab`)}
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {formatNumber(counts[key], locale)}
              </span>
            </Button>
          ))}
        </div>
        <div className="relative min-w-0 flex-[0_1_300px]">
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
      </div>

      {scope !== "templates" && (
        <section aria-labelledby="client-plans-heading" className="flex flex-col gap-3">
          <h2 id="client-plans-heading" className="text-xl leading-7 font-semibold">
            {t("clientPlans.title")}
          </h2>
          {clientPlans.length === 0 ? (
            <Card>
              <EmptyState
                brandMark
                title={t("clientPlans.emptyTitle")}
                description={t("clientPlans.emptyDescription")}
                action={<CreateDietPlanDialog locale={locale} clients={clients} />}
              />
            </Card>
          ) : shownPlans.length === 0 ? (
            noResults
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-4">
              {shownPlans.map((plan) => (
                <ClientPlan key={plan.id} locale={locale} plan={plan} />
              ))}
            </div>
          )}
        </section>
      )}

      {scope !== "assigned" && (
        <section aria-labelledby="templates-heading" className="flex flex-col gap-3">
          <div className="flex flex-col">
            <h2 id="templates-heading" className="text-xl leading-7 font-semibold">
              {t("templates.title")}
            </h2>
            <span className="text-muted-foreground">{t("templates.subtitle")}</span>
          </div>
          {templates.length === 0 ? (
            <Card>
              <EmptyState title={t("templates.emptyTitle")} description={t("templates.emptyDescription")} />
            </Card>
          ) : shownTemplates.length === 0 ? (
            noResults
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-4">
              {shownTemplates.map((plan) => (
                <Template key={plan.id} locale={locale} plan={plan} clients={clients} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
