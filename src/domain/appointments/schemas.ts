import { z } from "zod";

export const APPOINTMENT_TYPES = ["online", "in_person"] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Coach creating or rescheduling: wall-clock date + time in the coach's zone,
 * converted to UTC on the server. */
export const appointmentFormSchema = z.object({
  client_id: z.uuid(),
  date: dateString,
  time: timeString,
  duration_minutes: z.number().int().min(15).max(240),
  type: z.enum(APPOINTMENT_TYPES),
  location_or_link: z.string().max(500),
  notes: z.string().max(2000),
});
export type AppointmentFormInput = z.infer<typeof appointmentFormSchema>;

export const rescheduleSchema = appointmentFormSchema.pick({
  date: true,
  time: true,
  duration_minutes: true,
  type: true,
  location_or_link: true,
});
export type RescheduleInput = z.infer<typeof rescheduleSchema>;

/** Client requesting a slot the coach offered. */
export const sessionRequestSchema = z.object({
  starts_at: z.iso.datetime(),
  type: z.enum(APPOINTMENT_TYPES),
  notes: z.string().max(2000),
});
export type SessionRequestInput = z.infer<typeof sessionRequestSchema>;

export const reasonSchema = z.string().max(500);

export const weekdaySchema = z.number().int().min(0).max(6);

export const availabilityRuleSchema = z
  .object({ weekday: weekdaySchema, start_time: timeString, end_time: timeString })
  .refine((r) => r.end_time > r.start_time, { path: ["end_time"] });

export const availabilitySchema = z.object({
  timezone: z.string().min(1).max(64),
  rules: z.array(availabilityRuleSchema).max(42),
});
export type AvailabilityInput = z.infer<typeof availabilitySchema>;

export const exceptionSchema = z
  .object({
    date: dateString,
    is_off: z.boolean(),
    start_time: timeString.nullable(),
    end_time: timeString.nullable(),
  })
  .refine(
    (e) => (e.is_off ? !e.start_time && !e.end_time : !!e.start_time && !!e.end_time && e.end_time > e.start_time),
    { path: ["end_time"] }
  );
export type ExceptionInput = z.infer<typeof exceptionSchema>;

export const settingsSchema = z.object({
  cancel_cutoff_hours: z.number().int().min(0).max(336),
  slot_minutes: z.number().int().min(15).max(240),
  min_notice_hours: z.number().int().min(0).max(168),
});
export type SettingsInput = z.infer<typeof settingsSchema>;
