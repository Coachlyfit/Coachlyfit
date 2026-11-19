import { useTranslations } from "next-intl";
import { initialOf } from "@/domain/sites/display-name";
import type { SiteView } from "@/domain/sites/public-site";
import type { SectionKey } from "@/domain/sites/site-content";
import { waLink } from "@/lib/whatsapp";
import { ArrowIcon, WhatsAppIcon } from "./icons";
import { Silhouette } from "./silhouette";
import { SiteThemeToggle } from "./site-theme-toggle";

const LONG_NAME = 22;

/** Link target for "contact me": the WhatsApp number if there is one, else
 * the closing CTA block, else nothing. */
export function contactHref(view: SiteView, text: string, visible: ReadonlySet<SectionKey>): string | null {
  if (view.content.hero.whatsapp) return waLink(view.content.hero.whatsapp, text);
  return visible.has("cta") ? "#cta" : null;
}

export function SiteHero({
  view,
  visible,
  hasResults,
  hasReviews,
}: {
  view: SiteView;
  visible: ReadonlySet<SectionKey>;
  hasResults: boolean;
  hasReviews: boolean;
}) {
  const t = useTranslations("site");
  const { content: c, coachName } = view;
  const isLong = Array.from(coachName).length > LONG_NAME;
  const wa = c.hero.whatsapp ? waLink(c.hero.whatsapp, t("hero.whatsappText", { name: coachName })) : null;
  const primaryIsWhatsApp = c.hero.mainButton === "whatsapp" && wa !== null;
  const contact = contactHref(view, t("hero.whatsappText", { name: coachName }), visible);

  return (
    <section className="cs-ink cs-hero">
      <header className="cs-top cs-rise">
        <div className="cs-brand">
          <div className="cs-tile" aria-hidden="true">
            {view.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote Supabase URL, no next/image config
              <img src={view.logoUrl} alt="" />
            ) : (
              initialOf(coachName)
            )}
          </div>
          <span className="cs-brand-name">{coachName}</span>
        </div>
        <nav className="cs-nav" aria-label={t("nav.label")}>
          <div className="cs-nav-links">
            {visible.has("services") && <a href="#services">{t("nav.services")}</a>}
            {hasResults && <a href="#results">{t("nav.results")}</a>}
            {hasReviews && <a href="#reviews">{t("nav.reviews")}</a>}
          </div>
          <SiteThemeToggle />
          {contact && (
            <a href={contact} className="cs-btn cs-btn--ghost cs-btn--sm">
              {t("nav.contact")}
            </a>
          )}
        </nav>
      </header>

      <div className="cs-hero-grid">
        <div className="cs-hero-copy">
          <p className="cs-eyebrow cs-rise cs-d1">{c.hero.title.trim() || t("hero.eyebrow")}</p>
          <h1 className={isLong ? "cs-h1 cs-long cs-rise cs-d2" : "cs-h1 cs-rise cs-d2"}>{coachName}</h1>
          {c.hero.intro.trim() && <p className="cs-lead cs-hero-intro cs-rise cs-d3">{c.hero.intro}</p>}
          <div className="cs-actions cs-rise cs-d4">
            {primaryIsWhatsApp ? (
              <a href={wa} className="cs-btn cs-btn--ink">
                <WhatsAppIcon />
                {t("hero.whatsapp")}
              </a>
            ) : (
              <a href={visible.has("services") ? "#services" : "#cta"} className="cs-btn cs-btn--ink">
                {t("hero.join")}
                <span className="cs-arw cs-flip">
                  <ArrowIcon size={18} />
                </span>
              </a>
            )}
            {(hasResults || visible.has("services")) && (
              <a href={hasResults ? "#results" : "#services"} className="cs-btn cs-btn--ghost">
                {c.hero.secondaryLabel.trim() || t("hero.seeResults")}
                <span className="cs-arw cs-flip">
                  <ArrowIcon size={18} />
                </span>
              </a>
            )}
          </div>
        </div>

        <div className="cs-hero-photo cs-photo-in">
          {view.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote Supabase URL, no next/image config
            <img src={view.photoUrl} alt="" />
          ) : view.usePlaceholderPhoto ? (
            <Silhouette width="58%" />
          ) : (
            <div className="cs-mono-tile" role="img" aria-label={t("hero.noPhoto")}>
              {initialOf(coachName)}
            </div>
          )}
        </div>
      </div>
      <div className="cs-bar cs-grow" aria-hidden="true" />
    </section>
  );
}
