import { useTranslations } from "next-intl";
import type { SiteView } from "@/domain/sites/public-site";
import { InstagramIcon, TikTokIcon, YouTubeIcon } from "./icons";

export function SiteFooter({ view, year }: { view: SiteView; year: number }) {
  const t = useTranslations("site.footer");
  const { socials } = view.content;
  const links = [
    { href: socials.instagram, label: t("instagram"), icon: <InstagramIcon /> },
    { href: socials.tiktok, label: t("tiktok"), icon: <TikTokIcon /> },
    { href: socials.youtube, label: t("youtube"), icon: <YouTubeIcon /> },
  ].filter((l) => l.href);

  return (
    <footer className="cs-footer">
      {links.length > 0 && (
        <div className="cs-social">
          {links.map((l) => (
            <a key={l.label} href={l.href} aria-label={l.label} target="_blank" rel="noopener noreferrer">
              {l.icon}
            </a>
          ))}
        </div>
      )}
      <p className="cs-fine">
        {t("copyright", { year, name: view.coachName })}
        {view.domain && (
          <>
            {" · "}
            <bdi dir="ltr">{view.domain}</bdi>
          </>
        )}
      </p>
      <p className="cs-fine" style={{ fontSize: 13 }}>
        {t("powered")} <b style={{ color: "var(--footerfg, var(--fg))" }}>Coachly Fit</b>
      </p>
    </footer>
  );
}
