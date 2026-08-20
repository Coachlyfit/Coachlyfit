import { z } from "zod";

export const trainingModeSchema = z.object({
  trainingMode: z.enum(["online", "hybrid", "in_person"]),
});

const importFieldSchema = z.enum(["name", "phone", "goal", "fee", "skip"]);

export const importClientsSchema = z.object({
  rows: z.array(z.array(z.string())).min(1),
  fields: z.array(importFieldSchema),
});

export const templateKeySchema = z.object({
  templateKey: z.enum(["intake", "checkin", "diet"]),
});

export type TrainingModeInput = z.infer<typeof trainingModeSchema>;
export type ImportClientsInput = z.infer<typeof importClientsSchema>;
export type TemplateKeyInput = z.infer<typeof templateKeySchema>;
