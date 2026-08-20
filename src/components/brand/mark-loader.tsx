"use client";

import { useEffect, useRef } from "react";
import { CoachlyMark } from "./coachly-mark";

/**
 * Brand-level loading indicator. Per the motion spec's "Loading — the one
 * everyone gets wrong" card and `brand id/README.md`'s no-mirror rule
 * extended to motion: the ring never spins ("a rotated aperture is a
 * different mark"). Instead the arc draws and retracts *in place* — the
 * aperture stays exactly where it was drawn — while the dot holds and
 * pulses. 1400ms cycle, ease-in-out both ways, per the spec.
 *
 * This is for brand-identity loading moments only (e.g. full-page/section
 * loading tied to the mark itself). The app's existing ad-hoc
 * `<Loader2 className="animate-spin">` (forms-runtime/photo-file-input.tsx,
 * ui/sonner.tsx) is a generic Lucide spinner, not the brand mark, and is
 * intentionally left alone — spinning is fine for a generic icon, just never
 * for this one.
 */
const CYCLE_MS = 1400;

function easeInOut(x: number) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export interface MarkLoaderProps {
  size?: number;
  className?: string;
}

export function MarkLoader({ size = 44, className }: MarkLoaderProps) {
  const rootRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const arcNode = root.querySelector<SVGPathElement>("[data-anim-arc]");
    const dotNode = root.querySelector<SVGGElement>("[data-anim-dot] circle");
    if (!arcNode || !dotNode) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const length = arcNode.getTotalLength();
    arcNode.style.strokeDasharray = String(length);

    if (reduced) {
      arcNode.style.strokeDashoffset = "0";
      dotNode.style.opacity = "1";
      return;
    }

    let raf: number;
    const start = performance.now();

    function paint(now: number) {
      const phase = ((now - start) % CYCLE_MS) / CYCLE_MS;
      const offset =
        phase < 0.5
          ? -length * (1 - easeInOut(phase * 2))
          : length * easeInOut((phase - 0.5) * 2);
      arcNode!.style.strokeDashoffset = String(offset);
      dotNode!.style.opacity = (0.45 + 0.55 * (0.5 + 0.5 * Math.sin((now / CYCLE_MS) * Math.PI * 2))).toFixed(3);
      raf = requestAnimationFrame(paint);
    }
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <CoachlyMark
      ref={rootRef}
      size={size}
      className={className}
      data-brand-mark=""
      aria-label="loading"
    />
  );
}
