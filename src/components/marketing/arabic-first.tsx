import { CoachlyMark } from "@/components/brand/coachly-mark";
import type { SectionContent } from "@/domain/marketing/sections.schema";

/**
 * The "built Arabic-first" section. Its ground comes from the CMS (navy by
 * default, which SectionView renders as a `dark` subtree), so the nested
 * cards, borders and muted-foreground resolve on their own instead of being
 * hand-picked.
 */
export function ArabicFirst({ content }: { content: SectionContent<"arabic_first"> }) {
  // The hairline rule keeps the section legible as a distinct panel when its
  // ground matches the page's.
  return (
    <section className="relative overflow-hidden border-y border-foreground/10 py-20 sm:py-22">
      {/* Bleeds off the inline-start edge. `start-*` with a negative logical
          margin rather than -translate-x-*: translate is physical and would
          push the mark the same direction in both locales, breaking the
          mirror. The mark itself never mirrors — only its position does.
          Dimmed with `opacity` rather than a /alpha text colour: the dot is
          filled with var(--primary), so only opacity fades both the arc and
          the dot together. */}
      <CoachlyMark
        size={520}
        className="pointer-events-none absolute -top-24 start-0 -ms-40 hidden text-foreground opacity-[0.06] lg:block"
        aria-hidden="true"
      />

      <div className="relative mx-auto grid max-w-[1200px] items-center gap-10 px-4 lg:grid-cols-2 lg:gap-16">
        <div>
          {content.eyebrow && (
            <div className="font-mono text-[14px] font-medium uppercase tracking-[0.13em] text-primary">
              {content.eyebrow}
            </div>
          )}
          <h2 className="mt-4 text-balance text-2xl font-semibold leading-tight tracking-[-0.025em] md:text-[38px]">
            {content.title}
          </h2>
          <p className="mt-4 max-w-[46ch] text-pretty leading-relaxed text-muted-foreground">{content.subtitle}</p>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          {content.cards.map((card, i) => (
            <div key={i} className="rounded-xl bg-foreground/5 p-5 ring-1 ring-foreground/10">
              <div className="font-mono text-[17px] font-semibold">{card.title}</div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
