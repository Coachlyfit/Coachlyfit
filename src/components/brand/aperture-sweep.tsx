"use client";

import { useEffect, useRef } from "react";
import { CoachlyMark } from "./coachly-mark";

/**
 * The mark's one specified motion — "the arc draws, then the dot carries on
 * past it." Ported from `Coachlyfit Motion Spec.dc.html`'s `paint()`, whose
 * constants I verified independently: arc window 0→460ms (0.7667 of 600),
 * dot window 380→600ms (0.6333→1 of 600), 80ms overlap, dot travel
 * -35°→0° about the mark's centre with a c1=1.15 back-out overshoot.
 *
 * Two tracks, no animation library — framer-motion isn't installed and the
 * spec needs none: the dot's `rotate(θ 24 24)` follows the r19 circle around
 * the mark's own centre for free, so there's no motion path to author.
 *
 * Rules enforced here, from the spec's "Don't" list and `brand id/README.md`:
 * - never rotates the ring itself, only the dot's <g>
 * - runs once and rests — no ambient looping
 * - interruptible: unmounting mid-sweep just stops: there's no persisted
 *   timeline to resume, so nothing needs an explicit snap-to-rest handler
 * - under prefers-reduced-motion, skip the sweep and cross-fade to rest —
 *   see the `[data-brand-mark]` 120ms carve-out in globals.css, which this
 *   component's `data-brand-mark` attribute opts into
 */
const DURATION_MS = 600;
const ARC_END = DURATION_MS * 0.7667; // 460ms
const DOT_START = DURATION_MS * 0.6333; // 380ms
const DOT_WINDOW = DURATION_MS - DOT_START; // 220ms
const OVERSHOOT_C1 = 1.15;
const ARC_LENGTH = 80.98; // verified: 290.01° sweep at r16 ≈ 80.9854

function backOut(u: number, c1: number) {
  const c3 = c1 + 1;
  return u >= 1 ? 1 : 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
}

export interface ApertureSweepProps {
  size?: number;
  className?: string;
  /**
   * Skip the sweep and render at rest — same markup either way (this
   * component always renders CoachlyMark; only the effect differs), so
   * toggling this never causes a hydration mismatch. Used by LaunchMark to
   * gate the "once per cold start" rule without switching component identity.
   */
  skip?: boolean;
  /** Called once the 600ms sweep settles. Not called under reduced motion. */
  onSettled?: () => void;
}

export function ApertureSweep({ size = 88, className, skip = false, onSettled }: ApertureSweepProps) {
  const rootRef = useRef<SVGSVGElement>(null);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const arcNode = root.querySelector<SVGPathElement>("[data-anim-arc]");
    const dotNode = root.querySelector<SVGGElement>("[data-anim-dot]");
    if (!arcNode || !dotNode) return;

    arcNode.style.strokeDasharray = String(ARC_LENGTH);

    if (skip) {
      // Render at rest, no animation, no fade — this is the "already played
      // this session" / "not the first paint" case, distinct from the
      // reduced-motion case below which still fades in.
      arcNode.style.strokeDashoffset = "0";
      dotNode.setAttribute("transform", "rotate(0 24 24) translate(37.44 10.56) scale(1) translate(-37.44 -10.56)");
      dotNode.style.opacity = "1";
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      // Render at rest and cross-fade in over 120ms instead of the sweep —
      // the transition-duration carve-out for [data-brand-mark] in
      // globals.css is what makes this 120ms rather than the app's default
      // 0.01ms reduced-motion clamp.
      root.style.transition = "opacity 120ms";
      root.style.opacity = "0";
      arcNode.style.strokeDashoffset = "0";
      dotNode.setAttribute("transform", "rotate(0 24 24) translate(37.44 10.56) scale(1) translate(-37.44 -10.56)");
      dotNode.style.opacity = "1";
      requestAnimationFrame(() => {
        root.style.opacity = "1";
      });
      onSettled?.();
      return;
    }

    const start = performance.now();

    function paint(now: number) {
      const m = now - start;

      const arcT = Math.max(0, Math.min(1, m / ARC_END));
      const eased = 1 - Math.pow(1 - arcT, 3); // cubic-bezier(.22,.61,.36,1) approximation
      arcNode!.style.strokeDashoffset = String(-ARC_LENGTH * (1 - eased));

      const u = Math.max(0, Math.min(1, (m - DOT_START) / DOT_WINDOW));
      const eb = backOut(u, OVERSHOOT_C1);
      const rot = -35 + 35 * eb;
      const scale = 0.35 + 0.65 * Math.max(0.05, eb);
      const opacity = Math.min(1, u * 3.2);
      dotNode!.setAttribute(
        "transform",
        `rotate(${rot.toFixed(2)} 24 24) translate(37.44 10.56) scale(${scale.toFixed(3)}) translate(-37.44 -10.56)`
      );
      dotNode!.style.opacity = opacity.toFixed(3);

      if (m < DURATION_MS) {
        rafRef.current = requestAnimationFrame(paint);
      } else {
        // Settle exactly at rest — the raf loop can overshoot DURATION_MS
        // by a frame, so snap rather than trust the last computed values.
        arcNode!.style.strokeDashoffset = "0";
        dotNode!.setAttribute("transform", "rotate(0 24 24) translate(37.44 10.56) scale(1) translate(-37.44 -10.56)");
        dotNode!.style.opacity = "1";
        onSettled?.();
      }
    }

    rafRef.current = requestAnimationFrame(paint);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSettled intentionally not tracked: re-running the sweep on every re-render of a new callback identity would break "runs once per mount"
  }, [skip]);

  return <CoachlyMark ref={rootRef} size={size} className={className} data-brand-mark="" />;
}
