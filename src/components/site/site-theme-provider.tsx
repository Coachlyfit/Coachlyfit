import type { CSSProperties, ReactNode } from "react";
import { isCustomized, themeCss, type SiteTheme } from "@/domain/sites/palette";
import { siteStyleVars, type SiteColors } from "@/domain/sites/theme";
import "./site.css";

/** Root of the public site / review page / editor preview. Sets language,
 * direction and the two brand inputs (--p / --a, already contrast-guarded);
 * site.css derives every other token from them, unless the coach picked their
 * own colors (`theme`), which override the tokens they chose. */
export function SiteThemeProvider({
  locale,
  colors,
  theme,
  scheme,
  children,
  className,
}: {
  locale: "ar" | "en";
  colors: Pick<SiteColors, "primary" | "accent">;
  /** The coach's own palettes and light/dark mode. */
  theme?: SiteTheme;
  /** Force light or dark (the editor preview). Without it the site follows the
   * visitor's system, or the coach's chosen mode, and the visitor can switch
   * with the header toggle when nothing is forced. */
  scheme?: "light" | "dark";
  children: ReactNode;
  className?: string;
}) {
  const css = theme ? themeCss(theme, { p: colors.primary, a: colors.accent }) : "";
  const customized = !!theme && (isCustomized(theme.light) || isCustomized(theme.dark));
  const coachMode = theme && theme.mode !== "auto" ? theme.mode : undefined;
  const forced = scheme ?? coachMode;
  const classes = ["cs-root", customized ? "cs-themed" : "", className ?? ""].filter(Boolean).join(" ");

  return (
    <div
      className={classes}
      data-site
      data-scheme={forced}
      // A forced scheme can't be switched by the visitor toggle.
      data-locked={forced ? "" : undefined}
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      style={siteStyleVars(colors) as CSSProperties}
    >
      {/* Built in palette.ts from validated #rrggbb values only; no characters
          React would escape, so a plain child is exact. */}
      {css && <style>{css}</style>}
      {children}
    </div>
  );
}
