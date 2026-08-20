import { useTranslations } from "next-intl";
import { CoachlyMark } from "@/components/brand/coachly-mark";

/**
 * The "built Arabic-first" section. Always dark regardless of theme, so the
 * subtree is wrapped in `dark` — nested cards, borders and muted-foreground
 * then resolve against dark tokens on their own instead of being hand-picked.
 */
const CARDS = ["rtl", "currency", "whatsapp", "english"] as const;

export function ArabicFirst() {
  const t = useTranslations("marketing.arabicFirst");

  // Always dark. In light mode the ground alone separates it from the page;
  // in dark mode it matches the page background, so a hairline rule keeps
  // the section legible as a distinct panel in both themes.
  return (
    <section className="dark relative overflow-hidden border-y border-foreground/10 bg-background py-20 text-foreground sm:py-22">
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
          <div className="font-mono text-[11px] font-medium uppercase tracking-[0.13em] text-primary">
            {t("eyebrow")}
          </div>
          <h2 className="mt-4 text-balance text-2xl font-semibold leading-tight tracking-[-0.025em] md:text-[38px]">
            {t("title")}
          </h2>
          <p className="mt-4 max-w-[46ch] text-pretty leading-relaxed text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          {CARDS.map((key) => (
            <div key={key} className="rounded-xl bg-foreground/5 p-5 ring-1 ring-foreground/10">
              <div className="font-mono text-[17px] font-semibold">{t(`cards.${key}.title`)}</div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{t(`cards.${key}.body`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
