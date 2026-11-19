// The coach's own colors for their site, separately for light and dark.
//
// The coach picks up to seven colors per scheme (any left empty stays
// automatic). resolveTokens() turns those picks, plus the automatic defaults,
// into the full set of CSS tokens the site stylesheet uses, nudging any pick
// that would make text unreadable (WCAG AA: 4.5:1 for text, 3:1 for the
// accent). themeCss() emits them as CSS overrides; with nothing picked it emits
// nothing and site.css's own derivation applies.
//
// Every value emitted is a #rrggbb or rgba() built here from validated hex, so
// the CSS is safe to inline.
import { contrast, mix, normalizeHex } from "@/lib/brand-theme";

export const PALETTE_KEYS = ["primary", "accent", "background", "text", "heading", "card", "band", "cta", "footer"] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];
/** A picked #rrggbb, or null = automatic. */
export type Palette = Record<PaletteKey, string | null>;
export type SiteTheme = {
  /** auto: follow the visitor's system (they can switch). light/dark: always that. */
  mode: "auto" | "light" | "dark";
  light: Palette;
  dark: Palette;
};
export type Scheme = "light" | "dark";

export const emptyPalette = (): Palette => ({
  primary: null,
  accent: null,
  background: null,
  text: null,
  heading: null,
  card: null,
  band: null,
  cta: null,
  footer: null,
});
export const defaultTheme = (): SiteTheme => ({ mode: "auto", light: emptyPalette(), dark: emptyPalette() });
export const isCustomized = (p: Palette) => PALETTE_KEYS.some((k) => p[k] !== null);

/** Which resolved token shows each pick's current (automatic or chosen) color. */
export const PALETTE_TOKEN: Record<PaletteKey, string> = {
  primary: "--pfill",
  accent: "--acc",
  background: "--bg",
  text: "--fg",
  heading: "--heading",
  card: "--card",
  band: "--ink",
  cta: "--cta",
  footer: "--footer",
};

const WHITE = "#ffffff";
const BLACK = "#000000";
const NIGHT = "#020617"; // text on light fills; dark page
const INK = "#0f172a"; // default band; dark card; default light text
const PAGE = "#f8fafc"; // default light page

const AA = 4.5;
const LARGE = 3;

const minContrast = (c: string, against: string[]) => Math.min(...against.map((a) => contrast(c, a)));

/** The nearest shade of `color` (toward black or white) that reaches `target`
 * against every color in `against`. */
function ensure(color: string, against: string[], target: number): string {
  if (minContrast(color, against) >= target) return color;
  const poles = [BLACK, WHITE].sort((a, b) => minContrast(b, against) - minContrast(a, against));
  for (let step = 1; step <= 20; step++) {
    for (const pole of poles) {
      const candidate = mix(color, pole, step / 20);
      if (minContrast(candidate, against) >= target) return candidate;
    }
  }
  return poles[0];
}

/** Of `options`, the one that reads best on `bg`. */
const bestOn = (bg: string, options: string[]) => options.reduce((a, b) => (contrast(bg, b) > contrast(bg, a) ? b : a));

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export type ResolvedTokens = { tokens: Record<string, string>; adjusted: boolean };

/** Every token the site stylesheet needs for one scheme. `base` is the coach's
 * brand primary/accent (already contrast-guarded): they drive whatever the
 * coach hasn't picked. */
export function resolveTokens(scheme: Scheme, base: { p: string; a: string }, pal: Palette): ResolvedTokens {
  const dark = scheme === "dark";
  const pick = (k: PaletteKey) => normalizeHex(pal[k]);

  const bg = pick("background") ?? (dark ? NIGHT : PAGE);
  const card = pick("card") ?? (dark ? INK : WHITE);
  const textIn = pick("text") ?? (dark ? PAGE : INK);
  const fg = ensure(textIn, [bg, card], AA);
  let muted = fg;
  for (let i = 0; i <= 20; i++) {
    const candidate = mix(bg, fg, 0.72 + (i * 0.28) / 20);
    if (minContrast(candidate, [bg, card]) >= AA) {
      muted = candidate;
      break;
    }
  }

  // Headings: their own color, readable on the page and on cards. Defaults to
  // the body text color.
  const headingIn = pick("heading");
  const heading = headingIn ? ensure(headingIn, [bg, card], AA) : fg;

  // Footer: its own background; its text starts from the body colors and is
  // nudged to read on it. Defaults to the page.
  const footerIn = pick("footer");
  const footer = footerIn ?? bg;
  const footerfg = ensure(fg, [footer], AA);
  const footermuted = ensure(muted, [footer], AA);

  // The band (hero, results) is dark by default in both schemes.
  const band = pick("band") ?? INK;
  const inkfg = bestOn(band, [PAGE, INK]);
  let inkmuted = inkfg;
  for (let i = 0; i <= 20; i++) {
    const candidate = mix(band, inkfg, 0.78 + (i * 0.22) / 20);
    if (contrast(candidate, band) >= AA) {
      inkmuted = candidate;
      break;
    }
  }

  // Primary: the fill of buttons, with readable text on it.
  const primaryIn = pick("primary");
  const primaryFill0 = primaryIn ?? (dark ? mix(base.p, WHITE, 0.38) : base.p);
  const pfill = ensure(primaryFill0, [bestOn(primaryFill0, [WHITE, NIGHT])], AA);
  const pfg = bestOn(pfill, [WHITE, NIGHT]);

  // Primary as TEXT or a tint's text: must read on the page, cards and tint.
  const hue = primaryIn ?? base.p;
  const tint = mix(bg, hue, dark ? 0.26 : 0.1);
  const ptext = ensure(primaryIn ?? (dark ? mix(base.p, WHITE, 0.5) : base.p), [bg, card, tint], AA);
  const hl = ensure(mix(hue, WHITE, 0.52), [band], AA);

  // The button that sits on the band.
  const inkbtn0 = primaryIn ?? mix(base.p, WHITE, 0.38);
  const inkbtnfg0 = bestOn(inkbtn0, [NIGHT, WHITE]);
  const inkbtn = ensure(inkbtn0, [inkbtnfg0], AA);
  const inkbtnfg = bestOn(inkbtn, [NIGHT, WHITE]);

  // Accent: lines and large text drawn on the band.
  const accentIn = pick("accent");
  const acc = ensure(accentIn ?? (dark ? mix(base.a, WHITE, 0.28) : base.a), [band], LARGE);

  // The closing call-to-action block.
  const ctaIn = pick("cta");
  const cta0 = ctaIn ?? pfill;
  const cta = ensure(cta0, [bestOn(cta0, [WHITE, NIGHT])], AA);
  const ctafg = bestOn(cta, [WHITE, NIGHT]);

  const tokens: Record<string, string> = {
    "--bg": bg,
    "--card": card,
    "--fg": fg,
    "--muted": muted,
    "--heading": heading,
    "--footer": footer,
    "--footerfg": footerfg,
    "--footermuted": footermuted,
    "--line": rgba(fg, dark ? 0.14 : 0.1),
    "--line2": rgba(fg, dark ? 0.34 : 0.28),
    "--ink": band,
    "--inkfg": inkfg,
    "--inkmuted": inkmuted,
    "--inkline": rgba(inkfg, 0.16),
    "--inkph": rgba(inkfg, 0.07),
    "--inksil": rgba(inkfg, 0.24),
    "--hl": hl,
    "--inkbtn": inkbtn,
    "--inkbtnfg": inkbtnfg,
    "--pfill": pfill,
    "--pfg": pfg,
    "--ptext": ptext,
    "--tint": tint,
    "--acc": acc,
    "--cta": cta,
    "--ctafg": ctafg,
    "--slate": mix(bg, fg, 0.12),
    "--silA": mix(bg, fg, 0.38),
    "--silB": mix(bg, hue, 0.45),
  };

  const adjusted =
    (pick("text") !== null && fg !== pick("text")) ||
    (headingIn !== null && heading !== headingIn) ||
    (primaryIn !== null && pfill !== primaryIn) ||
    (accentIn !== null && acc !== accentIn) ||
    (ctaIn !== null && cta !== ctaIn);

  return { tokens, adjusted };
}

const decls = (tokens: Record<string, string>) =>
  Object.entries(tokens)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");

/** CSS overrides for the schemes the coach customized (no quote or angle
 * characters anywhere, so it renders safely as a plain <style> child), scoped under
 * `.cs-root.cs-themed` so they out-rank site.css whatever the stylesheet order.
 * Light picks apply when the visitor is (or chose) light, dark picks when dark;
 * an untouched scheme keeps site.css's own look. "" when nothing is picked. */
export function themeCss(theme: SiteTheme, base: { p: string; a: string }): string {
  const out: string[] = [];
  if (isCustomized(theme.light)) {
    const d = decls(resolveTokens("light", base, theme.light).tokens);
    out.push(
      `@media (prefers-color-scheme: light){.cs-root.cs-themed:not([data-scheme=dark]){${d}}}`,
      `.cs-root.cs-themed[data-scheme=light]{${d}}`
    );
  }
  if (isCustomized(theme.dark)) {
    const d = decls(resolveTokens("dark", base, theme.dark).tokens);
    out.push(
      `@media (prefers-color-scheme: dark){.cs-root.cs-themed:not([data-scheme=light]){${d}}}`,
      `.cs-root.cs-themed[data-scheme=dark]{${d}}`
    );
  }
  return out.join("\n");
}
