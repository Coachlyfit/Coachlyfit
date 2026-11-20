import { z } from "zod";

export const GOALS = ["lose_fat", "build_muscle", "general_fitness", "other"] as const;
export const ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "active", "very_active"] as const;
export const APPLICATION_STATUSES = ["new", "reviewing", "accepted", "rejected"] as const;

export type Goal = (typeof GOALS)[number];
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

// Error messages are i18n keys under site.apply.errors.* — the form maps them.
export const applicationSchema = z.object({
  name: z.string().trim().min(1, "name").max(100, "name"),
  email: z.string().trim().email("email").max(200, "email"),
  phone: z.string().trim().regex(/^\+?[0-9\s-]{5,30}$/, "phone"),
  goal: z.enum(GOALS, "goal"),
  activityLevel: z.enum(ACTIVITY_LEVELS, "activityLevel"),
  source: z.string().trim().max(200, "source").optional(),
  message: z.string().trim().max(2000, "message").optional(),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;

// Coach side: all a coach can change.
export const triageSchema = z.object({
  status: z.enum(APPLICATION_STATUSES),
  coachNotes: z.string().trim().max(2000).optional(),
});

export type TriageInput = z.infer<typeof triageSchema>;
