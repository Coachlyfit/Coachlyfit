// Same 8-tint avatar palette as tint-1..8 in globals.css, indexed by a
// stable hash of the client id so a given client keeps the same color
// across renders (and across every surface that shows their avatar)
// without storing one.
const TINT_CLASSES = [
  "bg-[var(--tint-1)]",
  "bg-[var(--tint-2)]",
  "bg-[var(--tint-3)]",
  "bg-[var(--tint-4)]",
  "bg-[var(--tint-5)]",
  "bg-[var(--tint-6)]",
  "bg-[var(--tint-7)]",
  "bg-[var(--tint-8)]",
];

export function tintFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TINT_CLASSES[hash % TINT_CLASSES.length];
}
