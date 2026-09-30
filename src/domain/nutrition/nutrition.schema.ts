import { z } from "zod";
import { addDays } from "./adherence";
import { isValidTimeZone } from "./reminders";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// "" from an empty input means "not given", same idiom as diets/schemas.ts.
const blankToNull = (v: unknown) => (v === "" || v === undefined ? null : v);
const optionalNumber = (schema: z.ZodNumber) => z.preprocess(blankToNull, z.coerce.number().pipe(schema).nullable());
const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable());

/** Logging is open for the last 7 days (the DB's 7-day edit lock) plus a
 * day of slack either side for timezones: the client sends their own
 * local date, which can be a day ahead of or behind the server's UTC one. */
export function isLoggableDate(date: string, now: Date): boolean {
  const today = now.toISOString().slice(0, 10);
  return date >= addDays(today, -7) && date <= addDays(today, 1);
}

export const bodyProfileSchema = z.object({
  height_cm: optionalNumber(z.number().min(100).max(250)),
  birth_date: z.preprocess(blankToNull, isoDate.nullable()),
  sex: z.preprocess(blankToNull, z.enum(["male", "female"]).nullable()),
  activity_level: z.preprocess(
    blankToNull,
    z.enum(["sedentary", "light", "moderate", "active", "very_active"]).nullable()
  ),
  goal: z.preprocess(blankToNull, z.enum(["cut", "maintain", "bulk"]).nullable()),
});
export type BodyProfileFormInput = z.input<typeof bodyProfileSchema>;

export const logIntakeSchema = z.object({
  log_date: isoDate,
  kcal: z.coerce.number().int().min(1).max(20000),
  protein_g: optionalNumber(z.number().min(0).max(2000)),
  carb_g: optionalNumber(z.number().min(0).max(2000)),
  fat_g: optionalNumber(z.number().min(0).max(2000)),
});

export const offPlanSchema = z.object({
  log_date: isoDate,
  meal: optionalText(100),
  note: optionalText(500),
  kcal: optionalNumber(z.number().int().min(1).max(20000)),
  photo_path: z.preprocess(blankToNull, z.string().max(500).nullable()),
});

export const reminderSettingsSchema = z.object({
  enabled: z.boolean(),
  remind_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().refine(isValidTimeZone),
});

export const assignTargetsSchema = z.object({
  target_kcal: z.coerce.number().int().min(1).max(10000),
  target_protein_g: z.coerce.number().min(0).max(1000),
  target_carb_g: z.coerce.number().min(0).max(1000),
  target_fat_g: z.coerce.number().min(0).max(1000),
});
