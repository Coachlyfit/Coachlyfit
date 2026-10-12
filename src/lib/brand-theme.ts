// Turns a coach's two brand colors into CSS variable overrides for light and
// dark mode. The coach picks a hue; we pick the shades, so every pairing
// still clears WCAG AA (4.5:1) the same way the default palette does (see the
// contrast notes above :root in globals.css):
//
//   primary -> CTA fills, active nav, links, focus ring, first chart series.
//              Light mode darkens it until white text passes on it (so it also
//              reads as link text on the light ground); dark mode lightens it
//              until it reads on the dark ground, paired with dark text.
//   accent  -> the accent-tint pair (highlight chips, selected rows, the
//              client's coach-decision card). Defaults to primary, which is
//              how the stock palette derives its own tint.
//
//   sidebar / sidebarText -> the coach nav's ground and its text. The nav is
//              one fixed ground in both modes, so both get the same pair. The
//              text is nudged (and, for mid-tone grounds, the ground too) until
//              the dimmed inactive items still read.
//
// Output is only ever built from normalized #rrggbb strings, so it's safe to
// inline in a <style> tag.

export type BrandColors = {
  primary: string | null;
  accent: string | null;
  sidebar?: string | null;
  sidebarText?: string | null;
};

const WHITE = "#ffffff";
const BLACK = "#000000";
const DARK_GROUND = "#020617";
// Primary is also link text, so its shade is picked against the lowest-contrast
// ground it sits on in each mode: the page (--background) in light, cards
// (--card) in dark. Clearing those clears white and DARK_GROUND too.
const LIGHT_PAGE = "#f8fafc";
const DARK_CARD = "#0f172a";
const AA = 4.5;
// Stock nav pieces, for when the coach sets only one of the two sidebar slots.
const SIDEBAR_TEXT = "#e2e8f0";
const SIDEBAR_RAIL = "#fb923c";

const HEX = /^#?([0-9a-f]{6})$/i;

export function normalizeHex(value: string | null | undefined): string | null {
  const match = value?.trim().match(HEX);
  return match ? `#${match[1].toLowerCase()}` : null;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

/** Linear sRGB blend: `amount` 0 = a, 1 = b. */
export function mix(a: string, b: string, amount: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return toHex([ar + (br - ar) * amount, ag + (bg - ag) * amount, ab + (bb - ab) * amount]);
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Steps `color` toward `towards` until it reaches `target` contrast against
 * `against`. Always terminates: at 100% it is `towards` itself. */
function shadeFor(color: string, towards: string, against: string, target = AA): string {
  for (let step = 0; step <= 20; step++) {
    const candidate = mix(color, towards, step / 20);
    if (contrast(candidate, against) >= target) return candidate;
  }
  return towards;
}

function bestText(fill: string, options: string[]): string {
  return options.reduce((best, c) => (contrast(fill, c) > contrast(fill, best) ? c : best));
}

/** Whether light text is the readable choice on `ground` (picks the nav's
 * lockup asset). */
export function isDarkGround(ground: string): boolean {
  return contrast(ground, WHITE) >= contrast(ground, DARK_CARD);
}

/** The nav's ground + text. Inactive items render the text at 70% opacity
 * (sidebar.tsx), so that dimmed color is what has to clear AA: first the text
 * steps toward white / navy, then a mid-tone ground steps away from it. */
function sidebarVars(ground: string, text: string, rail: string): Record<string, string> {
  const pole = isDarkGround(ground) ? WHITE : DARK_CARD;
  const away = pole === WHITE ? BLACK : WHITE;
  const reads = (g: string, fg: string) => contrast(mix(g, fg, 0.7), g) >= AA;
  let fg = pole;
  for (let step = 0; step <= 20; step++) {
    const candidate = mix(text, pole, step / 20);
    if (reads(ground, candidate)) {
      fg = candidate;
      break;
    }
  }
  for (let step = 1; step <= 20 && !reads(ground, fg); step++) ground = mix(ground, away, step / 20);
  const fill = mix(ground, fg, 0.12);
  return {
    "--sidebar": ground,
    "--sidebar-foreground": fg,
    "--sidebar-accent": fill,
    "--sidebar-accent-foreground": fg,
    "--sidebar-border": fill,
    // The active rail is a graphic, not text: 3:1.
    "--sidebar-ring": shadeFor(rail, fg, ground, 3),
  };
}

export function brandTokens(colors: BrandColors) {
  const primary = normalizeHex(colors.primary);
  const accent = normalizeHex(colors.accent) ?? primary;
  const sidebar = normalizeHex(colors.sidebar);
  const sidebarText = normalizeHex(colors.sidebarText);
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};

  if (primary) {
    const fillLight = shadeFor(primary, BLACK, LIGHT_PAGE);
    const fillDark = shadeFor(primary, WHITE, DARK_CARD);
    const textOnDark = bestText(fillDark, [DARK_GROUND, WHITE]);
    Object.assign(light, {
      "--primary": fillLight,
      "--primary-foreground": WHITE,
      "--sidebar-primary": fillLight,
      "--sidebar-primary-foreground": WHITE,
      "--sidebar-ring": fillDark,
      "--chart-1": fillLight,
    });
    Object.assign(dark, {
      "--primary": fillDark,
      "--primary-foreground": textOnDark,
      "--sidebar-primary": fillDark,
      "--sidebar-primary-foreground": textOnDark,
      "--sidebar-ring": fillDark,
      "--ring": fillDark,
      "--chart-1": fillDark,
    });
  }

  if (accent) {
    const tintLight = mix(accent, WHITE, 0.85);
    // Dark mode tint is a 15% wash over the dark ground, as in globals.css.
    const tintDark = mix(accent, DARK_GROUND, 0.85);
    light["--accent-tint"] = tintLight;
    light["--accent-tint-foreground"] = shadeFor(accent, BLACK, tintLight);
    dark["--accent-tint"] = tintDark;
    dark["--accent-tint-foreground"] = shadeFor(accent, WHITE, tintDark);
  }

  if (sidebar || sidebarText) {
    const text = sidebarText ?? SIDEBAR_TEXT;
    const rail = primary ?? SIDEBAR_RAIL;
    Object.assign(light, sidebarVars(sidebar ?? DARK_CARD, text, rail));
    Object.assign(dark, sidebarVars(sidebar ?? DARK_GROUND, text, rail));
  }

  return { light, dark };
}

function block(selector: string, vars: Record<string, string>): string {
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  return body ? `${selector}{${body}}` : "";
}

/** `html:not(.dark)` / `html.dark` out-rank globals.css's `:root` / `.dark`
 * regardless of stylesheet order. Pass `scope` to theme a preview box only. */
export function brandCss(colors: BrandColors, scope?: string): string {
  const { light, dark } = brandTokens(colors);
  const s = scope ? ` ${scope}` : "";
  return block(`html:not(.dark)${s}`, light) + block(`html.dark${s}`, dark);
}
