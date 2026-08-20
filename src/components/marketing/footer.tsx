import { useTranslations } from "next-intl";
import { CoachlyLockup } from "@/components/brand/coachly-lockup";

/**
 * Always dark regardless of theme — `dark` on the wrapper so nested borders
 * and muted copy resolve against dark tokens instead of hand-picked opacities.
 */
const COLUMNS = {
  product: ["features", "pricing", "faq"],
  company: ["about", "blog", "careers"],
  contact: ["whatsapp", "email", "instagram"],
} as const;

// Product links are same-page anchors; the rest are not built yet, so they
// point at the homepage rather than 404ing.
const HREFS: Record<string, string> = {
  features: "#features",
  pricing: "#pricing",
  faq: "#faq",
};

export function Footer() {
  const t = useTranslations("marketing.footer");
  const year = new Date().getFullYear();

  return (
    <footer className="dark bg-background pt-13 pb-10 text-foreground">
      <div className="mx-auto max-w-[1200px] px-4">
        <div className="grid grid-cols-2 gap-10 border-b border-border pb-9 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="col-span-2 lg:col-span-1">
            <CoachlyLockup height={31} onDarkGround />
            <p className="mt-4 max-w-[34ch] text-[13px] leading-relaxed text-muted-foreground">{t("tagline")}</p>
          </div>

          {(Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]).map((col) => (
            <div key={col}>
              <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {t(`columns.${col}.title`)}
              </div>
              <div className="mt-3.5 flex flex-col gap-2.5">
                {COLUMNS[col].map((link) => {
                  const href = HREFS[link];
                  const label = t(`columns.${col}.${link}`);
                  // Only the same-page anchors are real destinations today.
                  // The rest render as plain text rather than dead links to
                  // pages that don't exist yet.
                  return href ? (
                    <a
                      key={link}
                      href={href}
                      className="text-[13px] text-muted-foreground hover:text-foreground"
                    >
                      {label}
                    </a>
                  ) : (
                    <span key={link} className="text-[13px] text-muted-foreground">
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center">
          <div className="font-mono text-[11.5px] text-muted-foreground">
            {t("rights", { year })} · {t("location")}
          </div>
          <div className="flex gap-5 sm:ms-auto">
            <span className="text-[12.5px] text-muted-foreground">{t("privacy")}</span>
            <span className="text-[12.5px] text-muted-foreground">{t("terms")}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
