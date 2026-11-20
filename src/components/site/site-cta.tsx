import { useTranslations } from "next-intl";
import type { SiteView } from "@/domain/sites/public-site";
import { waLink } from "@/lib/whatsapp";
import { ApplyButton } from "./apply/apply-button";
import { ArrowIcon, WhatsAppIcon } from "./icons";

export function SiteCta({ view, siteKey }: { view: SiteView; siteKey?: string }) {
  const t = useTranslations("site");
  const { cta, hero } = view.content;
  const wa = hero.whatsapp ? waLink(hero.whatsapp, t("hero.whatsappText", { name: view.coachName })) : null;

  return (
    <section id="cta" className="cs-sec cs-cta">
      <div className="cs-cta-inner cs-reveal">
        <h2 className="cs-h1" style={{ lineHeight: 1.05 }}>
          {cta.title.trim() || t("cta.defaultTitle")}
        </h2>
        <p className="cs-lead">{cta.text.trim() || t("cta.defaultText")}</p>
        <div className="cs-actions">
          <ApplyButton siteKey={siteKey} className="cs-btn cs-btn--inv" />
          {wa && (
            <a href={wa} className="cs-btn cs-btn--outline-inv">
              <WhatsAppIcon />
              {cta.button.trim() || t("hero.whatsapp")}
            </a>
          )}
          <a href="#services" className="cs-btn cs-btn--outline-inv">
            {t("hero.join")}
            <span className="cs-arw cs-flip">
              <ArrowIcon size={18} />
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
