"use client";

import { useState } from "react";
import { CircleCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { groupPlans, isUnlimited, planBullets, POPULAR_PLAN, tierTitle, type PlanTier } from "@/domain/billing/plans";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** How a card's button behaves: a plain link (marketing), or a pick handled
 * by the page (the coach's subscription page). */
export type PlanCardsMode =
  | { kind: "link"; href: string; label: string }
  | { kind: "action"; currentTierId: string | null; disabled?: boolean; onChoose: (tierId: string) => void };

/** Display strings for a tier: the dropdown option, and a name that tells the
 * Pro Coach tiers apart (they share a name, differing by client count). */
export function usePlanLabels() {
  const t = useTranslations("plans");
  const locale = useLocale() as AppLocale;

  function tierOption(tier: PlanTier) {
    const price = formatNumber(tier.price_egp_monthly, locale);
    if (isUnlimited(tier.max_clients)) return t("tierOptionUnlimited", { price });
    return t("tierOption", {
      clients: formatNumber(tier.max_clients ?? 0, locale),
      seats: tier.max_team_members == null ? "∞" : formatNumber(tier.max_team_members, locale),
      price,
    });
  }

  return { tierOption, tierName: (tier: PlanTier) => tierTitle(tier, locale, t) };
}

export function PlanCards({ tiers, mode }: { tiers: PlanTier[]; mode: PlanCardsMode }) {
  const t = useTranslations("plans");
  const locale = useLocale() as AppLocale;
  const { tierOption } = usePlanLabels();
  // The tier picked in a family's dropdown; until one is, the current tier
  // (if it's in the family) or the cheapest.
  const [picked, setPicked] = useState<Record<string, string>>({});

  const currentId = mode.kind === "action" ? mode.currentTierId : null;
  const currentPrice = tiers.find((tier) => tier.id === currentId)?.price_egp_monthly ?? null;

  return (
    <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      {groupPlans(tiers).map(({ key, tiers: options }) => {
        const tier =
          options.find((o) => o.id === picked[key]) ?? options.find((o) => o.id === currentId) ?? options[0];
        const popular = key === POPULAR_PLAN;
        const isCurrent = tier.id === currentId;
        const description = pickLocale(tier, locale, "description");

        return (
          <div
            key={key}
            className={cn(
              "relative flex flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/10",
              popular && "ring-2 ring-primary shadow-lg"
            )}
          >
            <div className={cn("h-1.5 rounded-full", popular ? "bg-primary" : "bg-primary/25")} aria-hidden="true" />

            <div className="flex flex-col gap-1">
              {popular && (
                <span className="mb-1 w-fit rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {t("mostPopular")}
                </span>
              )}
              <h3 className="text-xl font-semibold">{pickLocale(tier, locale)}</h3>
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>

            {options.length > 1 && (
              <Select
                value={tier.id}
                onValueChange={(value) => value && setPicked((prev) => ({ ...prev, [key]: value }))}
                items={options.map((o) => ({ value: o.id, label: tierOption(o) }))}
              >
                <SelectTrigger className="w-full" aria-label={t("tierLabel")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {tierOption(o)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="flex flex-col gap-1">
              <p className="flex items-baseline gap-1.5">
                <span className="text-4xl font-semibold tabular-nums">{formatNumber(tier.price_egp_monthly, locale)}</span>
                <span className="text-sm font-medium">{t("currency")}</span>
                <span className="text-sm text-muted-foreground">{t("perMonth")}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {isUnlimited(tier.max_clients)
                  ? t("clientsUnlimited")
                  : t("clients", { count: formatNumber(tier.max_clients ?? 0, locale) })}
              </p>
              <p className="text-sm text-muted-foreground">
                {tier.max_team_members == null
                  ? t("seatsUnlimited")
                  : t("seats", { count: tier.max_team_members })}
              </p>
            </div>

            <div className="h-px bg-border" />

            <div className="flex flex-col gap-3">
              <p className="font-mono text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
                {t("included")}
              </p>
              <ul className="flex flex-col gap-2.5">
                {planBullets(tier.features).map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2.5 text-sm">
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{t(`features.${bullet}`)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {mode.kind === "link" ? (
              <Link
                href={mode.href}
                className={cn(buttonVariants({ variant: popular ? "default" : "outline" }), "mt-auto h-11 w-full")}
              >
                {mode.label}
              </Link>
            ) : (
              <Button
                type="button"
                variant={popular && !isCurrent ? "default" : "outline"}
                className="mt-auto h-11 w-full"
                disabled={isCurrent || mode.disabled}
                onClick={() => mode.onChoose(tier.id)}
              >
                {t(
                  isCurrent
                    ? "cta.current"
                    : currentPrice == null
                      ? "cta.subscribe"
                      : tier.price_egp_monthly > currentPrice
                        ? "cta.upgrade"
                        : "cta.downgrade"
                )}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
