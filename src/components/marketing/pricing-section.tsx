import { PlanCards } from "@/components/billing/plan-cards";
import { PLAN_TIER_COLUMNS, type PlanTier } from "@/domain/billing/plans";
import type { SectionContent } from "@/domain/marketing/sections.schema";

export const PRICING_TIER_COLUMNS = PLAN_TIER_COLUMNS;
export type PricingTier = PlanTier;

/** Takes the tiers as a prop rather than reading them: the same component
 * renders on the public page (server) and in the CMS preview (client). The
 * heading, subtitle and button label are CMS content; the cards are shared
 * with the coach's subscription page (components/billing/plan-cards). */
export function PricingSection({ content, tiers }: { content: SectionContent<"pricing">; tiers: PricingTier[] }) {
  return (
    <section id="pricing" className="mx-auto max-w-[1200px] px-4 py-20 sm:py-22">
      <div className="mb-11 flex flex-col items-center gap-3 text-center">
        <h2 className="text-balance text-2xl font-semibold tracking-[-0.025em] md:text-[38px]">{content.title}</h2>
        <p className="max-w-2xl text-pretty text-muted-foreground">{content.subtitle}</p>
      </div>
      <PlanCards tiers={tiers} mode={{ kind: "link", href: "/signup", label: content.cta }} />
    </section>
  );
}
