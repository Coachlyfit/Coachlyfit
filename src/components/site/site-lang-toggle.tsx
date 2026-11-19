"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

/** Arabic ⇄ English switch for the public site. A plain link, so it works as
 * soon as the page is up. On a coach's own domain the language rides on
 * `?lang=`; on the app URL (`/<lang>/sites/<slug>`) it's the first path
 * segment. The href is fixed up after mount, because the server doesn't know
 * which of the two the visitor is on. Hidden in the editor preview, which has
 * its own language control. */
export function SiteLangToggle() {
  const t = useTranslations("site.lang");
  const locale = useLocale();
  const other = locale === "ar" ? "en" : "ar";
  const [href, setHref] = useState(`?lang=${other}`);
  const [locked, setLocked] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- reads window.location / the DOM, which the server can't know; must run after mount to stay hydration-safe */
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".cs-root");
    if (root?.hasAttribute("data-locked")) setLocked(true);

    const { pathname, search, hash } = window.location;
    const pathMode = /^\/(ar|en)\/sites\//.test(pathname);
    if (pathMode) {
      setHref(`${pathname.replace(/^\/(ar|en)\//, `/${other}/`)}${search}${hash}`);
    } else {
      const params = new URLSearchParams(search);
      params.set("lang", other);
      setHref(`${pathname}?${params.toString()}${hash}`);
    }
  }, [other]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (locked) return null;

  return (
    <a
      href={href}
      hrefLang={other}
      lang={other}
      className="cs-btn cs-btn--ghost cs-btn--round"
      aria-label={other === "en" ? t("toEnglish") : t("toArabic")}
      style={{ fontWeight: 600 }}
    >
      {other === "en" ? "EN" : "عربي"}
    </a>
  );
}
