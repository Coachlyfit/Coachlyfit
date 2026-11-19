import { useTranslations } from "next-intl";
import { WhatsAppIcon } from "../icons";

function ClockIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** Expired, used or unknown link: one generic screen (it never says which). */
export function ReviewExpired({
  coachName,
  whatsappHref,
  siteHref,
}: {
  coachName: string;
  /** wa.me link with a prefilled "please send a new link", when the coach has a number. */
  whatsappHref: string | null;
  siteHref: string;
}) {
  const t = useTranslations("clientReview.expired");
  return (
    <main className="cs-rv-wrap">
      <div className="cs-field" style={{ alignItems: "flex-start", gap: 16 }}>
        <div className="cs-big-icon">
          <ClockIcon />
        </div>
        <h1 className="cs-h2" style={{ fontSize: 30 }}>
          {t("title")}
        </h1>
        <p className="cs-lead" style={{ color: "var(--muted)" }}>
          {t("text", { coach: coachName })}
        </p>
      </div>
      <div className="cs-field">
        {whatsappHref && (
          <a href={whatsappHref} className="cs-btn cs-btn--primary cs-btn--lg" target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon />
            {t("askNew")}
          </a>
        )}
        <a href={siteHref} className="cs-btn cs-btn--outline cs-btn--lg">
          {t("visit")}
        </a>
      </div>
    </main>
  );
}
