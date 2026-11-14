import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import type { AdminMetrics } from "./types";

const TIER_COLOR: Record<string, string> = {
  starter: "bg-primary",
  pro: "bg-chart-4",
  elite: "bg-success",
};
const TRIAL_COLOR = "bg-muted-foreground/50";

const TIER_NAME = { starter: "starter", pro: "pro", elite: "elite" } as const;

/** Paying coaches per tier (same "active" definition as MRR) plus trials,
 * straight from admin_metrics().plan_mix -- nothing is counted here. */
export async function PlanMix({ metrics, locale }: { metrics: AdminMetrics; locale: AppLocale }) {
  const t = await getTranslations("admin.home.mix");
  const tLibrary = await getTranslations("admin.library");
  const tHome = await getTranslations("admin.home.library");
  const tTiers = await getTranslations("admin.coaches.segments");

  // plan_mix has a row per tier, and Pro Coach is sold in several tiers that
  // share one key, so sum per plan family: one bar segment per family.
  const families = new Map<string, { count: number; mrr: number }>();
  for (const tier of metrics.plan_mix) {
    const family = families.get(tier.key) ?? { count: 0, mrr: 0 };
    families.set(tier.key, { count: family.count + tier.count, mrr: family.mrr + tier.mrr_egp });
  }

  const rows = [
    ...[...families].map(([key, family]) => ({
      key,
      name: key in TIER_NAME ? tTiers(TIER_NAME[key as keyof typeof TIER_NAME]) : key,
      ltr: true,
      color: TIER_COLOR[key] ?? "bg-chart-5",
      count: family.count,
      mrr: family.mrr,
    })),
    { key: "trial", name: t("trial"), ltr: false, color: TRIAL_COLOR, count: metrics.trialing_count, mrr: 0 },
  ];
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <section aria-labelledby="mix-heading" className="flex min-w-0 flex-[1_1_280px] flex-col gap-3.5 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <h2 id="mix-heading" className="text-xl leading-7 font-semibold">
        {t("title")}
      </h2>
      {/* Decorative: the rows below carry every number as text. */}
      <div className="flex h-3.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {total > 0 &&
          rows.map((row) => (
            <div key={row.key} className={row.color} style={{ width: `${(row.count / total) * 100}%` }} />
          ))}
      </div>
      <ul className="flex flex-col gap-3.5">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2.5">
            <span className={cn("size-2.5 shrink-0 rounded-[3px]", row.color)} aria-hidden="true" />
            <span className="flex-1 font-medium" dir={row.ltr ? "ltr" : undefined}>
              <bdi>{row.name}</bdi>
            </span>
            <span className="font-mono text-muted-foreground tabular-nums">
              {row.mrr > 0 ? formatNumber(row.mrr, locale) : "—"}
            </span>
            <span className="w-6 text-end font-mono font-semibold tabular-nums">{formatNumber(row.count, locale)}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/admin/library"
        className="mt-auto flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted"
      >
        <span className="flex flex-col leading-snug">
          <span className="font-semibold">{tLibrary("title")}</span>
          <span className="text-[0.8125rem] text-muted-foreground">{tHome("note")}</span>
        </span>
        <span className="font-medium text-primary">{tHome("manage")}</span>
      </Link>
    </section>
  );
}
