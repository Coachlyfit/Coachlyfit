/** Turns a coach-typed English label into a stable body_metrics.metric key
 * -- lowercase, non-alphanumeric runs collapsed to one underscore, capped
 * at 50 chars to match the column's practical width. Applied once at
 * creation (not re-derived on every read), so renaming a metric's display
 * label later never breaks the key already stored on existing
 * body_metrics rows. */
export function slugifyMetricKey(labelEn: string): string {
  return labelEn
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}
