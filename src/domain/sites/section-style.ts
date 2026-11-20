// Per-section look of the coach site: colors (separately for light and dark),
// font sizes and vertical padding. Every field is optional: null means "use the
// site's default", and a section with no styles renders exactly as before.
//
// sectionCss() turns these into one scoped <style> (same idea as themeCss() in
// palette.ts). It only ever prints values that passed the zod schema below
// (hex colors and integers), so it is safe as a plain <style> child.
import { z } from "zod";

/** Lowercase #rrggbb, or #rrggbbaa when the coach lowered the opacity. */
const color = z.string().regex(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
const schemeColor = z.object({ light: color.nullable(), dark: color.nullable() });

export const STYLE_LIMITS = {
  headingSize: { min: 16, max: 96 },
  bodySize: { min: 12, max: 24 },
  padding: { min: 0, max: 160 },
} as const;

const px = (l: { min: number; max: number }) => z.number().int().min(l.min).max(l.max).nullable();

export const sectionStyleSchema = z.object({
  bg: schemeColor,
  text: schemeColor,
  heading: schemeColor,
  headingSize: px(STYLE_LIMITS.headingSize),
  bodySize: px(STYLE_LIMITS.bodySize),
  paddingTop: px(STYLE_LIMITS.padding),
  paddingBottom: px(STYLE_LIMITS.padding),
});
export type SectionStyle = z.infer<typeof sectionStyleSchema>;

export type ColorField = "bg" | "text" | "heading";
export type SizeField = "headingSize" | "bodySize" | "paddingTop" | "paddingBottom";
export type StyleScheme = "light" | "dark";

export const emptyStyle = (): SectionStyle => ({
  bg: { light: null, dark: null },
  text: { light: null, dark: null },
  heading: { light: null, dark: null },
  headingSize: null,
  bodySize: null,
  paddingTop: null,
  paddingBottom: null,
});

/** Does this style change anything? (An all-null style is the same as none.) */
export function isStyled(s: SectionStyle | undefined): boolean {
  if (!s) return false;
  const colors: ColorField[] = ["bg", "text", "heading"];
  return (
    colors.some((f) => s[f].light !== null || s[f].dark !== null) ||
    s.headingSize !== null ||
    s.bodySize !== null ||
    s.paddingTop !== null ||
    s.paddingBottom !== null
  );
}

const SLOT_KEY = /^[a-z]+$/;

function colorDecls(s: SectionStyle, scheme: StyleScheme): { box: string; heading: string } {
  const box: string[] = [];
  const bg = s.bg[scheme];
  const text = s.text[scheme];
  const heading = s.heading[scheme];
  if (bg) box.push(`background:${bg}`);
  if (text) {
    // Body text, the dimmer text under it, and the on-dark variants all follow
    // the one color the coach picked.
    box.push(
      `color:${text}`,
      `--fg:${text}`,
      `--inkfg:${text}`,
      `--muted:color-mix(in srgb,${text} 70%,transparent)`,
      `--inkmuted:color-mix(in srgb,${text} 70%,transparent)`
    );
  }
  return { box: box.join(";"), heading: heading ? `color:${heading}` : "" };
}

const HEADINGS = ":is(.cs-h1,.cs-h2,h3)";

/** The CSS for every styled section. "" when nothing is set, so an untouched
 * site gets no <style> at all. */
export function sectionCss(styles: Partial<Record<string, SectionStyle>> | undefined): string {
  const out: string[] = [];
  for (const [key, s] of Object.entries(styles ?? {})) {
    if (!s || !isStyled(s) || !SLOT_KEY.test(key)) continue;
    const slot = `.cs-root [data-slot=${key}]`;

    const plain: string[] = [];
    const box: string[] = [];
    if (s.paddingTop !== null) box.push(`padding-block-start:${s.paddingTop}px`);
    if (s.paddingBottom !== null) box.push(`padding-block-end:${s.paddingBottom}px`);
    if (box.length) plain.push(`${slot}>*{${box.join(";")}}`);
    if (s.headingSize !== null) plain.push(`${slot} :is(.cs-h1,.cs-h2){font-size:${s.headingSize}px}`);
    if (s.bodySize !== null) plain.push(`${slot} p{font-size:${s.bodySize}px}`);
    out.push(...plain);

    for (const scheme of ["light", "dark"] as const) {
      const d = colorDecls(s, scheme);
      if (!d.box && !d.heading) continue;
      const other = scheme === "light" ? "dark" : "light";
      const rules = (prefix: string) =>
        [d.box && `${prefix} [data-slot=${key}]>*{${d.box}}`, d.heading && `${prefix} [data-slot=${key}] ${HEADINGS}{${d.heading}}`]
          .filter(Boolean)
          .join("");
      out.push(
        `@media (prefers-color-scheme: ${scheme}){${rules(`.cs-root:not([data-scheme=${other}])`)}}`,
        rules(`.cs-root[data-scheme=${scheme}]`)
      );
    }
  }
  return out.join("\n");
}
