import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { CoachlyMark } from "@/components/brand/coachly-mark";
import { cn } from "@/lib/utils";
import type { SectionContent } from "@/domain/marketing/sections.schema";

/**
 * The small marketing sections — each is a heading plus a list of text blocks
 * and nothing more. Kept in one file rather than seven ~35-line ones.
 *
 * None of them paints its own ground: SectionView wraps each one in the
 * background picked in the CMS, and a navy ground is a `dark` subtree. So
 * everything here uses the plain theme tokens (foreground, muted-foreground,
 * card, primary) and reads correctly on all three grounds.
 */
const EYEBROW = "font-mono text-[11px] font-medium uppercase tracking-[0.13em] text-primary";

const TESTIMONIAL_TINTS = ["bg-tint-1", "bg-tint-2"];

/**
 * Deliberately not aria-hidden, unlike the dashboard/form mocks: these are
 * real claims about the product, not decorative furniture.
 */
export function StatsBand({ content }: { content: SectionContent<"stats"> }) {
  return (
    <section className="py-7">
      <div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-8 px-4 text-center sm:grid-cols-4">
        {content.items.map((item, i) => (
          <div key={i}>
            {/* The last figure is the design's accent one. */}
            <div
              className={cn(
                "font-mono text-[30px] font-semibold tracking-[-0.02em]",
                i === content.items.length - 1 && "text-primary"
              )}
            >
              {item.value}
            </div>
            <div className="mt-1.5 text-[12.5px] text-muted-foreground">{item.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Testimonials({ content }: { content: SectionContent<"testimonials"> }) {
  return (
    <section id="coaches" className="py-20 sm:py-22">
      <div className="mx-auto max-w-[1200px] px-4">
        <h2 className="max-w-[26ch] text-balance text-2xl font-semibold leading-tight tracking-[-0.025em] md:text-[34px]">
          {content.title}
        </h2>
        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          {content.items.map((item, i) => (
            <figure key={i} className="m-0 rounded-2xl bg-card p-7 ring-1 ring-foreground/10">
              <blockquote className="text-pretty text-[17px] leading-relaxed">{item.quote}</blockquote>
              <figcaption className="mt-6 flex items-center gap-3.5">
                {/* Initials rather than a photo — the design ships an empty
                    image slot, and a stock headshot would say less. */}
                <div
                  className={cn(
                    "flex size-13 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white",
                    TESTIMONIAL_TINTS[i % TESTIMONIAL_TINTS.length]
                  )}
                  aria-hidden="true"
                >
                  {item.initial}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{item.name}</div>
                  <div className="mt-0.5 text-[12.5px] text-muted-foreground">{item.meta}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ProblemSection({ content }: { content: SectionContent<"pain_points"> }) {
  return (
    <section className="py-20 sm:py-22">
      <div className="mx-auto max-w-[1200px] px-4">
        <div className="mb-11 max-w-[56ch]">
          {content.eyebrow && <div className={EYEBROW}>{content.eyebrow}</div>}
          <h2 className="mt-4 text-balance text-2xl font-semibold leading-tight tracking-[-0.025em] md:text-[38px]">
            {content.title}
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">{content.subtitle}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {content.cards.map((card, i) => (
            <div key={i} className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
              <div className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {card.label}
              </div>
              <h3 className="mt-3.5 text-[17px] font-semibold">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HowItWorks({ content }: { content: SectionContent<"how_it_works"> }) {
  return (
    <section className="py-20 sm:py-22">
      <div className="mx-auto max-w-[1200px] px-4">
        <h2 className="max-w-[26ch] text-balance text-2xl font-semibold leading-tight tracking-[-0.025em] md:text-[38px]">
          {content.title}
        </h2>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {content.steps.map((step, i) => (
            <li key={i} className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
              <div className="font-mono text-[13px] font-semibold text-primary" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </div>
              <h3 className="mt-3.5 text-[17px] font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Faq({ content }: { content: SectionContent<"faq"> }) {
  return (
    <section id="faq" className="py-20 sm:py-22">
      <div className="mx-auto grid max-w-[1200px] items-start gap-10 px-4 lg:grid-cols-[340px_1fr] lg:gap-16">
        <h2 className="text-balance text-2xl font-semibold leading-tight tracking-[-0.025em] md:text-[32px]">
          {content.title}
        </h2>
        <div>
          {content.items.map((item, i) => (
            <div key={i} className="border-b border-border py-5.5 last:border-b-0">
              <h3 className="text-base font-semibold">{item.q}</h3>
              <p className="mt-2 max-w-[70ch] text-pretty text-sm leading-relaxed text-muted-foreground">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Static mark, not ApertureSweep: this sits below the fold, and the brand's
 * one specified motion belongs to the hero's first paint.
 */
export function FinalCta({ content }: { content: SectionContent<"final_cta"> }) {
  return (
    <section className="py-20 text-center sm:py-23">
      <div className="mx-auto max-w-[1200px] px-4">
        <CoachlyMark size={82} className="mx-auto mb-7 text-foreground" aria-hidden="true" />
        <h2 className="text-balance text-3xl font-semibold leading-[1.15] tracking-[-0.028em] md:text-[42px]">
          {content.title}
        </h2>
        <p className="mx-auto mt-4 max-w-[52ch] text-pretty text-[17px] leading-relaxed text-muted-foreground">
          {content.subtitle}
        </p>
        {content.cta && (
          <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "mt-8 h-14 px-8 text-base")}>
            {content.cta}
          </Link>
        )}
      </div>
    </section>
  );
}
