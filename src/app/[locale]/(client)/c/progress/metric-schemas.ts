import { z } from "zod";

export { METRIC_PRESETS, METRIC_PRESET_UNIT } from "@/domain/progress/metric-presets";

export const bodyMetricSchema = z.object({
  taken_on: z.string(),
  metric: z.string().min(1).max(50),
  value: z.coerce.number(),
  unit: z.string().min(1).max(20),
});

export type BodyMetricFormInput = z.input<typeof bodyMetricSchema>;
export type BodyMetricInput = z.output<typeof bodyMetricSchema>;
