import { useTranslations } from "next-intl";

/**
 * Two small sections that share nothing but their shape — a heading plus a
 * list of text blocks. Kept in one file rather than two ~35-line ones.
 */
const EYEBROW = "font-mono text-[11px] font-medium uppercase tracking-[0.13em] text-primary";

const PROBLEM_CARDS = ["excel", "whatsapp", "notes"] as const;
const FAQ_ITEMS = ["a", "b", "c", "d", "e"] as const;

export function ProblemSection() {
  const t = useTranslations("marketing.problem");

  return (
    <section className="bg-muted/40 py-20 sm:py-22">
      <div className="mx-auto max-w-[1200px] px-4">
        <div className="mb-11 max-w-[56ch]">
          <div className={EYEBROW}>{t("eyebrow")}</div>
          <h2 className="mt-4 text-balance text-2xl font-semibold leading-tight tracking-[-0.025em] md:text-[38px]">
            {t("title")}
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROBLEM_CARDS.map((key) => (
            <div key={key} className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
              <div className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {t(`cards.${key}.label`)}
              </div>
              <h3 className="mt-3.5 text-[17px] font-semibold">{t(`cards.${key}.title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`cards.${key}.body`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Faq() {
  const t = useTranslations("marketing.faq");

  return (
    <section id="faq" className="bg-muted/40 py-20 sm:py-22">
      <div className="mx-auto grid max-w-[1200px] items-start gap-10 px-4 lg:grid-cols-[340px_1fr] lg:gap-16">
        <h2 className="text-balance text-2xl font-semibold leading-tight tracking-[-0.025em] md:text-[32px]">
          {t("title")}
        </h2>
        <div>
          {FAQ_ITEMS.map((key) => (
            <div key={key} className="border-b border-border py-5.5 last:border-b-0">
              <h3 className="text-base font-semibold">{t(`items.${key}.q`)}</h3>
              <p className="mt-2 max-w-[70ch] text-pretty text-sm leading-relaxed text-muted-foreground">
                {t(`items.${key}.a`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
