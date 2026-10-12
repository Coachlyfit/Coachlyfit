/** Dropped barbell with a small error badge. Decorative. */
export function DroppedBarbell() {
  return (
    <svg viewBox="0 0 220 120" aria-hidden="true" className="h-auto w-[min(260px,70vw)]">
      <line x1="20" y1="104" x2="200" y2="104" strokeWidth="3" strokeLinecap="round" className="stroke-border" />
      <g transform="rotate(-14 110 70)">
        <rect x="34" y="66" width="152" height="8" rx="4" className="fill-muted-foreground" />
        <rect x="22" y="40" width="18" height="60" rx="5" className="fill-foreground" />
        <rect x="44" y="48" width="10" height="44" rx="4" className="fill-foreground/80" />
        <rect x="166" y="48" width="10" height="44" rx="4" className="fill-foreground/80" />
        <rect x="180" y="40" width="18" height="60" rx="5" className="fill-foreground" />
      </g>
      <circle cx="168" cy="22" r="14" className="fill-destructive-tint" />
      <rect x="166.5" y="13" width="3" height="11" rx="1.5" className="fill-destructive" />
      <circle cx="168" cy="29" r="2" className="fill-destructive" />
    </svg>
  );
}
