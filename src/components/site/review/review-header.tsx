import { useTranslations } from "next-intl";
import { initialOf } from "@/domain/sites/display-name";

/** Ink band with the coach's logo and name, an optional heading, and the
 * accent bar as its bottom edge. The coach is the identity here; Coachly Fit
 * only appears in the small footer. */
export function ReviewHeader({
  coachName,
  logoUrl,
  title,
  subtitle,
}: {
  coachName: string;
  logoUrl: string | null;
  title?: string;
  subtitle?: string;
}) {
  return (
    <header className="cs-ink">
      <div className="cs-rv-head">
        <div className="cs-brand">
          <div className="cs-tile" aria-hidden="true">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote Supabase URL, no next/image config
              <img src={logoUrl} alt="" />
            ) : (
              initialOf(coachName)
            )}
          </div>
          <span className="cs-brand-name">{coachName}</span>
        </div>
        {title && <h1>{title}</h1>}
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="cs-bar" aria-hidden="true" />
    </header>
  );
}

export function ReviewFooter() {
  const t = useTranslations("site.footer");
  return (
    <p className="cs-rv-foot cs-fine" style={{ fontSize: 13 }}>
      {t("powered")} <b style={{ color: "var(--fg)" }}>Coachly Fit</b>
    </p>
  );
}
