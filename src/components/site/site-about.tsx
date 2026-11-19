import { useLocale, useTranslations } from "next-intl";
import { initialOf } from "@/domain/sites/display-name";
import type { SiteView } from "@/domain/sites/public-site";
import type { AppLocale } from "@/domain/locale";
import { formatNumber } from "@/lib/format";
import { Silhouette } from "./silhouette";

export function SiteAbout({ view }: { view: SiteView }) {
  const t = useTranslations("site.about");
  const tHero = useTranslations("site.hero");
  const locale = useLocale() as AppLocale;
  const { about } = view.content;

  return (
    <section id="about" className="cs-sec cs-about">
      <div className="cs-about-photo cs-reveal">
        {view.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote Supabase URL, no next/image config
          <img src={view.photoUrl} alt={t("photoAlt", { name: view.coachName })} loading="lazy" />
        ) : view.usePlaceholderPhoto ? (
          <Silhouette width="62%" />
        ) : (
          <div className="cs-mono-tile" role="img" aria-label={tHero("noPhoto")}>
            {initialOf(view.coachName)}
          </div>
        )}
      </div>
      <div className="cs-about-copy cs-reveal">
        <h2 className="cs-h2">{t("title")}</h2>
        {about.bio.trim() && <p className="cs-lead">{about.bio}</p>}
        {about.certs.length > 0 && (
          <ul className="cs-wrap" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {about.certs.map((cert) => (
              <li key={cert} className="cs-chip cs-chip--outline">
                {cert}
              </li>
            ))}
          </ul>
        )}
        {(about.years !== null || about.clients !== null) && (
          <div className="cs-stats">
            {about.years !== null && (
              <div className="cs-stat">
                <b className="cs-mono">{formatNumber(about.years, locale)}</b>
                <span>{t("years")}</span>
              </div>
            )}
            {about.clients !== null && (
              <div className="cs-stat">
                <b className="cs-mono">{formatNumber(about.clients, locale)}</b>
                <span>{t("clients")}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
