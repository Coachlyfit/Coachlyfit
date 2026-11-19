import { useLocale, useTranslations } from "next-intl";
import type { AppLocale } from "@/domain/locale";
import type { SiteView } from "@/domain/sites/public-site";
import { formatNumber } from "@/lib/format";

/** Bio, certifications and stats. The coach photo lives in the hero only:
 * showing the same picture again here read as a duplicate. */
export function SiteAbout({ view }: { view: SiteView }) {
  const t = useTranslations("site.about");
  const locale = useLocale() as AppLocale;
  const { about } = view.content;

  return (
    <section id="about" className="cs-sec">
      <div className="cs-about-copy cs-about-solo cs-reveal">
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
