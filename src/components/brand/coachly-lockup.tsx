"use client";

import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { CoachlyMark } from "./coachly-mark";

/**
 * The wordmark + mark lockup. Locale-aware (Arabic vs Latin asset — per
 * `brand id/README.md` the mark itself never mirrors, only the lockup's
 * script and mark-side flip, which the pre-built Arabic asset already
 * encodes) and theme-aware (light/dark asset swap).
 *
 * Theme switching is CSS-only (`dark:` variant), matching the pattern in
 * theme-toggle.tsx: next-themes sets the `dark` class on <html> before
 * hydration, so both assets can render and only one is shown — no `mounted`
 * state, no flash, no client effect needed.
 *
 * Identity spec v2 re-boxed both lockups to a shared 48-unit-tall canvas
 * (Latin 199.5×48, Arabic 213.37×48 — v1 was 39 vs 42.7, a 9% mismatch at any
 * shared CSS height). Both scripts now render the mark at the same size for
 * the same `height`, so sizing is height-based per the spec ("pin lockups by
 * height, never by width") — width follows each asset's own intrinsic ratio.
 *
 * Below 22px tall the identity spec says lockups stop working (mark
 * diameter would drop under its 18px floor) — render the standalone mark
 * instead.
 */
const LOCKUP_HEIGHT = 48;
const LOCKUP_WIDTH = { ar: 213.37, en: 199.5 } as const;

export interface CoachlyLockupProps {
  height?: number;
  className?: string;
  /**
   * Force the dark-ground asset regardless of app theme — for surfaces that
   * are always a dark ground independent of light/dark mode, e.g. the
   * sidebar (`bg-sidebar` is #0F172A in light mode, #020617 in dark; both
   * need the light-on-dark lockup).
   */
  onDarkGround?: boolean;
  /** The opposite force: a ground that is light in both modes (a Studio
   * coach's light sidebar color). */
  onLightGround?: boolean;
}

export function CoachlyLockup({
  height = 32,
  className,
  onDarkGround = false,
  onLightGround = false,
}: CoachlyLockupProps) {
  const locale = useLocale();

  if (height < 22) {
    return <CoachlyMark size={Math.max(24, height)} className={className} />;
  }

  const isArabic = locale === "ar";
  const width = height * (LOCKUP_WIDTH[isArabic ? "ar" : "en"] / LOCKUP_HEIGHT);
  const lightSrc = isArabic ? "/brand/lockup-arabic.svg" : "/brand/lockup-latin.svg";
  const darkSrc = isArabic ? "/brand/lockup-arabic-dark.svg" : "/brand/lockup-latin-dark.svg";

  if (onDarkGround || onLightGround) {
    const src = onDarkGround ? darkSrc : lightSrc;
    // eslint-disable-next-line @next/next/no-img-element -- decorative brand asset, not content needing next/image optimization
    return <img src={src} alt="coachlyfit" width={width} height={height} className={className} />;
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative brand asset, not content needing next/image optimization */}
      <img
        src={lightSrc}
        alt="coachlyfit"
        width={width}
        height={height}
        className={cn("block dark:hidden", className)}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative brand asset, not content needing next/image optimization */}
      <img
        src={darkSrc}
        alt="coachlyfit"
        width={width}
        height={height}
        className={cn("hidden dark:block", className)}
      />
    </>
  );
}
