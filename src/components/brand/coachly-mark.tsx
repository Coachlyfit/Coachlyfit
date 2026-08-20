import { forwardRef, type SVGProps } from "react";

/**
 * The Coachlyfit "aperture" mark: an open ring cut at 70° with a dot sitting
 * past the opening. Geometry verified against `public/brand/mark.svg` /
 * `mark-micro.svg` (identity spec v2, `brand/kit-v2/README.md`) and against
 * `Coachlyfit Motion Spec.dc.html`'s own `paint()` — sweep 290.01°, arc
 * length 80.9854u, dot at radius 19.007 / 45°.
 *
 * Renders on a 0 0 48 48 viewBox (not the 4.5 4.5 39 39 box the static
 * mark.svg ships with) because ApertureSweep's `rotate(θ 24 24)` assumes the
 * mark's centre sits at (24,24) — see identity spec, "Do" rule: never rotate
 * the aperture itself, only the dot travels.
 *
 * Below 26px the identity spec calls for mark-micro geometry — heavier
 * stroke, larger dot — not a scaled-down standard mark. v2's micro cut sets
 * dot:stroke to 1.50 (vs v1's 1.08): below ~1.45 at micro sizes the dot
 * loses the mass that differentiates it from a notch in the ring, which is
 * exactly the defect v1 shipped.
 */
const STANDARD = { r: 16, strokeWidth: 7, dotRadius: 4.2 };
const MICRO = { r: 15.5, strokeWidth: 8, dotRadius: 6.0 };

// Arc path for r16 (standard, 70° aperture) vs r15.5 (micro, 88° aperture —
// wider cut is what keeps the dot legible at small sizes). Endpoints taken
// directly from public/brand/mark.svg and mark-micro.svg so the React mark
// and the static SVG assets never drift.
function arcPath(r: number) {
  if (r === STANDARD.r) return "M26.78 8.24 A16 16 0 1 0 39.76 21.22";
  return "M24.27 8.50 A15.5 15.5 0 1 0 39.50 23.73";
}

export interface CoachlyMarkProps extends Omit<SVGProps<SVGSVGElement>, "size" | "viewBox" | "children"> {
  size?: number;
}

export const CoachlyMark = forwardRef<SVGSVGElement, CoachlyMarkProps>(function CoachlyMark(
  { size = 24, className, "aria-label": ariaLabel, ...rest },
  ref
) {
  // Hard switch at 26px (identity spec v2 §Sizes) — never interpolate
  // between the two cuts.
  const geo = size < 26 ? MICRO : STANDARD;
  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label={ariaLabel ?? "coachlyfit"}
      className={className}
      {...rest}
    >
      <path
        data-anim-arc
        d={arcPath(geo.r)}
        fill="none"
        stroke="currentColor"
        strokeWidth={geo.strokeWidth}
      />
      <g data-anim-dot>
        <circle cx="37.44" cy="10.56" r={geo.dotRadius} fill="var(--primary)" />
      </g>
    </svg>
  );
});
