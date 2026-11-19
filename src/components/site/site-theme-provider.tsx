import type { CSSProperties, ReactNode } from "react";
import { siteStyleVars, type SiteColors } from "@/domain/sites/theme";
import "./site.css";

/** Root of the public site / review page / editor preview. Sets language,
 * direction and the two brand inputs (--p / --a, already contrast-guarded);
 * site.css derives every other token from them. */
export function SiteThemeProvider({
  locale,
  colors,
  scheme,
  children,
  className,
}: {
  locale: "ar" | "en";
  colors: Pick<SiteColors, "primary" | "accent">;
  /** Force light or dark (the editor preview). Without it the site follows the
   * visitor's system, and the visitor can switch with the header toggle. */
  scheme?: "light" | "dark";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={className ? `cs-root ${className}` : "cs-root"}
      data-site
      data-scheme={scheme}
      // A forced scheme can't be switched by the visitor toggle.
      data-locked={scheme ? "" : undefined}
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      style={siteStyleVars(colors) as CSSProperties}
    >
      {children}
    </div>
  );
}
