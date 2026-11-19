import { contrast, mix, normalizeHex } from "@/lib/brand-theme";

export type CardTheme = "light" | "dark" | "coach";
export type CardCoachColors = { primary: string | null; accent: string | null };

const WHITE = "#ffffff";
const AA = 4.5;

// Values from the Tokens board ("Card theme roles"). Ink and the Coachly mark
// never change with the coach theme.
const LIGHT = {
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  ink: "#0F172A",
  muted: "#64748B",
  line: "#E2E8F0",
  primary: "#C2410C",
  onPrimary: "#FFFFFF",
  accent: "#EA580C",
  tint: "#FFEDD5",
  tintInk: "#9A3412",
  photoBg: "#E2E8F0",
  markDot: "#C2410C",
};

const DARK = {
  bg: "#020617",
  surface: "#0F172A",
  ink: "#E2E8F0",
  muted: "#94A3B8",
  line: "#1E293B",
  primary: "#C2410C",
  onPrimary: "#FFFFFF",
  accent: "#EA580C",
  tint: "#3A1A0A",
  tintInk: "#FB923C",
  photoBg: "#1E293B",
  markDot: "#FB923C",
};

/** The coach theme needs a primary that white text can sit on. Anything under
 * AA is rejected, so the option is disabled instead of shipping an unreadable
 * card. */
export function coachThemeUsable(colors: CardCoachColors): boolean {
  const primary = normalizeHex(colors.primary);
  return primary != null && contrast(primary, WHITE) >= AA;
}

/** CSS variables for one card theme. `coach` falls back to light when the
 * coach colors are missing or unreadable. */
export function cardVars(theme: CardTheme, coach: CardCoachColors): Record<string, string> {
  let t = LIGHT;
  if (theme === "dark") {
    t = DARK;
  } else if (theme === "coach" && coachThemeUsable(coach)) {
    const primary = normalizeHex(coach.primary)!;
    const accent = normalizeHex(coach.accent) ?? primary;
    t = {
      ...LIGHT,
      bg: mix(primary, WHITE, 0.94),
      line: mix(primary, WHITE, 0.82),
      primary,
      accent,
      tint: mix(accent, WHITE, 0.85),
      tintInk: primary,
    };
  }
  return {
    "--card-bg": t.bg,
    "--card-surface": t.surface,
    "--card-ink": t.ink,
    "--card-muted": t.muted,
    "--card-line": t.line,
    "--card-primary": t.primary,
    "--card-on-primary": t.onPrimary,
    "--card-accent": t.accent,
    "--card-tint": t.tint,
    "--card-tint-ink": t.tintInk,
    "--card-photo-bg": t.photoBg,
    "--card-mark-dot": t.markDot,
  };
}
