import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatNumber } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";
import type { SectionContent } from "@/domain/marketing/sections.schema";

export const PRICING_TIER_COLUMNS = "id, key, name_ar, name_en, price_egp_monthly, max_clients, features";

export type PricingTier = Pick<
  Tables<"subscription_tiers">,
  "id" | "key" | "name_ar" | "name_en" | "price_egp_monthly" | "max_clients" | "features"
>;

// No cap is null. Rows seeded before 20261015000001 still carry the old
// 999999 sentinel, so that reads as "unlimited" too.
const UNLIMITED_THRESHOLD = 100000;

// Display order for feature flags — `features` is stored as a flags object
// ({forms_builder: true, ...}), not a list, so unknown/future keys are
// silently skipped rather than rendered in an arbitrary jsonb key order.
const FEATURE_ORDER = [
  "forms_builder",
  "custom_library",
  "priority_support",
  "white_label",
  "custom_branding",
] as const;

/** Takes the tiers as a prop rather than reading them: the same component
 * renders on the public page (server) and in the CMS preview (client). The
 * heading, subtitle and button label are CMS content; the per-tier labels
 * describe plan data and stay in the message files. */
export function PricingSection({ content, tiers }: { content: SectionContent<"pricing">; tiers: PricingTier[] }) {
  const t = useTranslations("marketing.pricing");
  const locale = useLocale() as AppLocale;

  return (
    <section id="pricing" className="mx-auto max-w-[1200px] px-4 py-20 sm:py-22">
      <div className="mb-11 flex flex-col items-center gap-3 text-center">
        <h2 className="text-balance text-2xl font-semibold tracking-[-0.025em] md:text-[38px]">{content.title}</h2>
        <p className="max-w-2xl text-pretty text-muted-foreground">{content.subtitle}</p>
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiers.map((tier) => {
          const isPopular = tier.key === "pro";
          const flags = tier.features as Record<string, boolean> | null;
          const featureList = FEATURE_ORDER.filter((key) => flags?.[key]);

          return (
            <div
              key={tier.id}
              className={cn(
                "relative flex flex-col rounded-2xl p-7",
                // The featured tier is a dark card in both themes: `dark`
                // flips the subtree so its text, rule and muted copy all
                // resolve against dark tokens rather than being overridden.
                isPopular
                  ? "dark bg-background text-foreground ring-2 ring-primary"
                  : "bg-card ring-1 ring-foreground/10"
              )}
            >
              {isPopular && (
                <span className="absolute -top-2.5 start-7 rounded-full bg-primary px-3 py-1 font-mono text-[10.5px] font-semibold tracking-[0.08em] text-primary-foreground">
                  {t("mostPopular")}
                </span>
              )}

              <h3 className="text-[15px] font-semibold">{pickLocale(tier, locale, "name")}</h3>

              <p className="mt-3.5 flex items-baseline gap-2">
                <span className="font-mono text-[40px] font-semibold tracking-[-0.03em] tabular-nums">
                  {formatNumber(tier.price_egp_monthly, locale)}
                </span>
                <span className="text-[13px] text-muted-foreground">{t("perMonth")}</span>
              </p>

              <p className="mt-2 text-[13px] text-muted-foreground">
                {tier.max_clients == null || tier.max_clients >= UNLIMITED_THRESHOLD
                  ? t("unlimitedClients")
                  : t("clientLimit", { max: formatNumber(tier.max_clients, locale) })}
              </p>

              <div className="my-6 h-px bg-border" />

              <ul className="mb-7 flex flex-col gap-3">
                {featureList.map((key) => (
                  <li key={key} className="flex items-start gap-2.5">
                    <span className="text-primary" aria-hidden="true">
                      —
                    </span>
                    <span className="text-[13.5px] leading-relaxed">{t(`features.${key}`)}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/signup"
                className={cn(
                  buttonVariants({ variant: isPopular ? "default" : "outline" }),
                  // mt-auto keeps every tier's CTA on one line despite
                  // differing feature counts.
                  "mt-auto h-11.5 w-full"
                )}
              >
                {content.cta}
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
