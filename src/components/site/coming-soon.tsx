import { useTranslations } from "next-intl";
import { initialOf } from "@/domain/sites/display-name";

/** Shown while a coach's site is unpublished ("Site is live" switched off, or
 * never published). Only the coach's own branding; nothing else is public. */
export function ComingSoon({ coachName, logoUrl }: { coachName: string; logoUrl: string | null }) {
  const t = useTranslations("site");
  return (
    <main className="cs-soon cs-ink">
      <div className="cs-top">
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
      </div>
      <div className="cs-soon-body">
        <h1 className="cs-h1 cs-rise" style={{ fontSize: "clamp(40px, 9cqw, 96px)" }}>
          {t("comingSoon.title")}
        </h1>
        <p className="cs-lead cs-hero-intro cs-rise cs-d1">{t("comingSoon.text", { name: coachName })}</p>
      </div>
      <div className="cs-bar cs-grow" aria-hidden="true" />
    </main>
  );
}
