import type { CSSProperties, ReactNode } from "react";
import { siteStyleVars, type SiteColors } from "@/domain/sites/theme";
import "./site.css";

/** Root of the public site / review page / editor preview. Sets language,
 * direction and the two brand inputs (--p / --a, already contrast-guarded);
 * site.css derives every other token from them. */
export function SiteThemeProvider({
  locale,
  colors,
  children,
  className,
}: {
  locale: "ar" | "en";
  colors: Pick<SiteColors, "primary" | "accent">;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={className ? `cs-root ${className}` : "cs-root"}
      data-site
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      style={siteStyleVars(colors) as CSSProperties}
    >
      {children}
    </div>
  );
}
