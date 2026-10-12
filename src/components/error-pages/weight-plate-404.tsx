/** "404" in the mono font with the 0 drawn as a weight plate. Colors come
 * from tokens so it follows dark mode: the plate is the foreground (navy in
 * light), the center ring is `primary`. */
export function WeightPlate404() {
  return (
    <div
      dir="ltr"
      aria-hidden="true"
      className="flex items-center gap-[clamp(8px,2vw,16px)] font-mono text-[clamp(88px,16vw,148px)] leading-none font-semibold"
    >
      <span>4</span>
      <svg viewBox="0 0 120 120" className="size-[0.86em]">
        <circle cx="60" cy="60" r="56" className="fill-foreground" />
        <circle cx="60" cy="60" r="44" fill="none" strokeWidth="4" className="stroke-background/20" />
        <circle cx="60" cy="60" r="30" fill="none" strokeWidth="2" className="stroke-background/30" />
        <circle cx="60" cy="60" r="12" className="fill-background" />
        <circle cx="60" cy="60" r="12" fill="none" strokeWidth="4" className="stroke-primary" />
        <text
          x="60"
          y="34"
          textAnchor="middle"
          fontSize="11"
          fontWeight="600"
          fontFamily="var(--font-mono), monospace"
          className="fill-background/60"
        >
          20 KG
        </text>
      </svg>
      <span>4</span>
    </div>
  );
}
