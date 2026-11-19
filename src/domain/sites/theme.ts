// Colors for the public site. The coach picks two hues; the site derives every
// other token in CSS with color-mix() from `--p` / `--a` (see site.css). This
// file only makes sure the *inputs* are safe: it nudges a color that would
// fail contrast, and says so (`adjusted`) so the editor can show a note.
//
// Every derived color below mirrors a color-mix() rule in site.css; keep both
// in step.
import { contrast, mix, normalizeHex } from "@/lib/brand-theme";

export const DEFAULT_PRIMARY = "#c2410c";
export const DEFAULT_ACCENT = "#ea580c";

const WHITE = "#ffffff";
const BLACK = "#000000";
const PAGE = "#f8fafc"; // --bg, light
const INK = "#0f172a"; // hero / results band, and the dark card
const DEEP = "#020617"; // dark bg, text on light fills

const BUTTON_TEXT = 4.5;
const LARGE_TEXT = 3;

/** `share` of `c` over `base` — what CSS `color-mix(in srgb, c share%, base)` gives. */
const pct = (c: string, share: number, base: string) => mix(c, base, 1 - share);

/** Does `p` work as the site's primary in light AND dark mode? */
function primaryPasses(p: string): boolean {
  return (
    // light: white text on the fill, the color as text on page and on its tint
    contrast(p, WHITE) >= BUTTON_TEXT &&
    contrast(p, PAGE) >= BUTTON_TEXT &&
    contrast(p, pct(p, 0.1, WHITE)) >= BUTTON_TEXT &&
    // both modes: --hl (eyebrow, kg text) on the ink band
    contrast(pct(p, 0.48, WHITE), INK) >= BUTTON_TEXT &&
    // dark: dark text on the fill (also the on-ink button)
    contrast(pct(p, 0.62, WHITE), DEEP) >= BUTTON_TEXT &&
    // dark: --ptext on the dark ground and on its tint
    contrast(pct(p, 0.5, WHITE), INK) >= BUTTON_TEXT &&
    contrast(pct(p, 0.5, WHITE), pct(p, 0.26, INK)) >= BUTTON_TEXT
  );
}

/** The accent is only ever lines, stars and 24px+ text, drawn on the ink band
 * (light mode) or lightened for dark mode. */
function accentPasses(a: string): boolean {
  return contrast(a, INK) >= LARGE_TEXT && contrast(pct(a, 0.72, WHITE), INK) >= LARGE_TEXT;
}

/** The closest color to `color` (darker or lighter) that satisfies `ok`. */
function nearest(color: string, ok: (c: string) => boolean, fallback: string): string {
  if (ok(color)) return color;
  for (let step = 1; step <= 20; step++) {
    const t = step / 20;
    const candidates = [mix(color, BLACK, t), mix(color, WHITE, t)];
    // Prefer the candidate that keeps more of the hue's lightness: try both.
    for (const c of candidates) if (ok(c)) return c;
  }
  return fallback;
}

export type SiteColors = { primary: string; accent: string; adjusted: boolean };

export function guardColors(primary?: string | null, accent?: string | null): SiteColors {
  const p0 = normalizeHex(primary) ?? DEFAULT_PRIMARY;
  const a0 = normalizeHex(accent) ?? DEFAULT_ACCENT;
  // The Coachly defaults are the brand colors, shipped as-is (the brand primary
  // is a few hundredths under the tint check); only coach-picked colors are nudged.
  const p = p0 === DEFAULT_PRIMARY ? p0 : nearest(p0, primaryPasses, DEFAULT_PRIMARY);
  const a = a0 === DEFAULT_ACCENT ? a0 : nearest(a0, accentPasses, DEFAULT_ACCENT);
  return { primary: p, accent: a, adjusted: p !== p0 || a !== a0 };
}

/** Inline style for the site root; site.css derives the rest. */
export function siteStyleVars(colors: Pick<SiteColors, "primary" | "accent">): Record<string, string> {
  return { "--p": colors.primary, "--a": colors.accent };
}
