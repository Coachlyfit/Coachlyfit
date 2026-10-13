import { useTranslations } from "next-intl";
import { CoachlyLockup } from "@/components/brand/coachly-lockup";
import { Link } from "@/i18n/navigation";

const LEGAL_LINKS = [
  ["terms", "terms"],
  ["privacy", "privacy"],
  ["cookies", "cookies"],
  ["acceptable-use", "acceptableUse"],
  ["billing", "billing"],
] as const;

/**
 * Always dark regardless of theme — `dark` on the wrapper so nested borders
 * and muted copy resolve against dark tokens instead of hand-picked opacities.
 */
const COLUMNS = {
  product: ["features", "pricing", "demo"],
  company: ["about", "blog", "careers"],
  contact: ["whatsapp", "email", "instagram"],
} as const;

// Product links are home-page anchors (so they also work from /legal/*);
// contact links are external. The rest are not built yet, so they render as
// plain text rather than 404ing.
const HREFS: Record<string, string> = {
  features: "/#features",
  pricing: "/#pricing",
  whatsapp: "https://wa.me/201113284111",
  instagram: "https://www.instagram.com/coachlyfit",
};

export function Footer({ supportEmail }: { supportEmail: string }) {
  const t = useTranslations("marketing.footer");
  const tLegal = useTranslations("legal.nav");
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
                  const href = link === "email" ? `mailto:${supportEmail}` : HREFS[link];
                  const external = href?.startsWith("http");
                  const label = link === "email" ? supportEmail : t(`columns.${col}.${link}`);
                  // Only anchors and contact links are real destinations today.
                  // The rest render as plain text rather than dead links to
                  // pages that don't exist yet.
                  return href?.startsWith("/") ? (
                    <Link key={link} href={href} className="text-[13px] text-muted-foreground hover:text-foreground">
                      {label}
                    </Link>
                  ) : href ? (
                    <a
                      key={link}
                      href={href}
                      {...(external && { target: "_blank", rel: "noopener noreferrer" })}
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
          <nav aria-label={tLegal("title")} className="flex flex-wrap gap-x-5 gap-y-2 sm:ms-auto">
            {LEGAL_LINKS.map(([slug, key]) => (
              <Link
                key={slug}
                href={`/legal/${slug}`}
                className="text-[12.5px] text-muted-foreground hover:text-foreground"
              >
                {tLegal(key)}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
