import { useLocale, useTranslations } from "next-intl";
import type { AppLocale } from "@/domain/locale";
import type { SiteView } from "@/domain/sites/public-site";
import { formatNumber } from "@/lib/format";

/** Services the coach has actually named; rows with no title are drafts. */
export function namedServices(view: SiteView) {
  return view.content.services.filter((s) => s.title.trim() !== "");
}

export function SiteServices({ view, contactHref }: { view: SiteView; contactHref: string }) {
  const t = useTranslations("site.services");
  const locale = useLocale() as AppLocale;
  const services = namedServices(view);

  return (
    <section id="services" className="cs-sec">
      <div className="cs-reveal">
        <h2 className="cs-h2">{t("title")}</h2>
        <p className="cs-sub">{t("sub")}</p>
      </div>
      <div className="cs-svc-list">
        {services.map((s, i) => {
          const hasPrice = !s.contactForPrice && s.price !== null;
          return (
            <div key={i} className="cs-svc cs-reveal">
              <h3>{s.title}</h3>
              <p>{s.description}</p>
              <div className="cs-svc-price">
                {hasPrice ? (
                  <>
                    <span className="cs-price cs-mono">{formatNumber(s.price as number, locale)}</span>{" "}
                    <span className="cs-unit">{s.unit === "month" ? t("unitMonth") : t("unitOnce")}</span>
                  </>
                ) : (
                  <a href={contactHref} className="cs-link">
                    {t("contactPrice")}
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
