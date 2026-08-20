// Shared between the client's add-metric dialog and both pages' chart
// rendering, so the preset list, its units, and its translated label
// lookup live in exactly one place. Framework-free (no next/react import)
// so it can sit in src/domain — the "presets.<key>" i18n keys themselves
// are resolved by callers via next-intl, this module only says which keys
// are presets vs. free-text metrics a coach or client invented.
export const METRIC_PRESETS = ["waist_cm", "chest_cm", "arm_cm", "hip_cm", "body_fat_pct"] as const;

export type MetricPreset = (typeof METRIC_PRESETS)[number];

const PRESET_SET: ReadonlySet<string> = new Set(METRIC_PRESETS);

export const METRIC_PRESET_UNIT: Record<MetricPreset, string> = {
  waist_cm: "cm",
  chest_cm: "cm",
  arm_cm: "cm",
  hip_cm: "cm",
  body_fat_pct: "%",
};

export function isMetricPreset(metric: string): metric is MetricPreset {
  return PRESET_SET.has(metric);
}

/** i18n key for a metric's display label — a preset's translated key, or
 * null for a coach/client-invented metric that has no translation and
 * should fall back to `metric.replace(/_/g, " ")` at the call site. */
export function metricPresetI18nKey(metric: string): string | null {
  return isMetricPreset(metric) ? `presets.${metric}` : null;
}
