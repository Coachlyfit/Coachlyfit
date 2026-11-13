import { z } from "zod";
import { MUSCLE_GROUPS } from "./taxonomy";
import { normalizeMeasurementType } from "./measurement";
// ponytail: domain -> route import, kept so the server schema stays the single
// source of the length limits; move schemas.ts into domain if a 2nd consumer appears.
import { createExerciseSchema } from "@/app/[locale]/(coach)/library/schemas";

/** Pure logic behind the guided exercise dialog: the form's zod schema, the
 * conversion between a DB row / the wire FormData and the form's own shape,
 * the 4-box tempo, and the per-section status the nav shows. No React in
 * here so all of it is unit-testable. */

// Error "messages" below are i18n keys under library.exercise.form.errors —
// the sections translate them, so the schema stays locale-free.
const urlField = z
  .string()
  .refine((v) => v === "" || z.string().url().safeParse(v).success, "invalidUrl")
  .optional();

// Same ceilings as the server schema (createExerciseSchema), applied to the
// newline-joined text the action actually receives — a list that fits here
// must not come back as invalid_input from the server.
const lines = (maxJoined: number) =>
  z.array(z.string()).refine((rows) => cleanRows(rows).join("\n").length <= maxJoined, "tooLong");

export const exerciseFormSchema = createExerciseSchema
  .extend({
    name_ar: z.string().trim().min(1, "required").max(100, "tooLong"),
    name_en: z.string().trim().min(1, "required").max(100, "tooLong"),
    // Required here (not on the server schema, which other callers share).
    muscle_group: z.enum(MUSCLE_GROUPS, { error: "required" }),
    video_url: urlField,
    image_url: urlField,
    thumbnail_url: urlField,
    video_url_alt: urlField,
    cues_ar: lines(1000),
    cues_en: lines(1000),
    steps_ar: lines(2000),
    steps_en: lines(2000),
    mistakes_ar: lines(1000),
    mistakes_en: lines(1000),
    primary_muscles: lines(500),
    secondary_muscles: lines(500),
  })
  .superRefine((v, ctx) => {
    // The DB needs both or neither; the action rejects it too, but a
    // generic invalid_input after submit is a poor way to say so.
    if (!!v.skill_group !== (v.skill_level != null)) {
      ctx.addIssue({ code: "custom", path: ["skill_level"], message: "skillIncomplete" });
    }
  });

export type ExerciseFormValues = z.infer<typeof exerciseFormSchema>;
type FieldName = keyof ExerciseFormValues;

export function cleanRows(rows: readonly string[] | null | undefined): string[] {
  return (rows ?? []).map((r) => r.trim()).filter(Boolean);
}

/** The row fields the form reads — structural, so the library search row,
 * the admin row and a test literal are all assignable. */
export type ExerciseSource = {
  [K in Exclude<
    FieldName,
    "muscle_group" | "measurement_type" | "difficulty" | "skill_group" | "skill_level" | "source_exercise_id"
  >]?: (ExerciseFormValues[K] extends string[] ? string[] : string) | null;
} & {
  id?: string;
  muscle_group?: string | null;
  measurement_type?: string | null;
  difficulty?: string | null;
  skill_group?: string | null;
  skill_level?: number | null;
};

const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;

export function toFormValues(item?: ExerciseSource): ExerciseFormValues {
  const s = (v: string | null | undefined) => v ?? "";
  const a = (v: string[] | null | undefined) => [...(v ?? [])];
  const muscle = MUSCLE_GROUPS.find((g) => g === item?.muscle_group);
  const difficulty = DIFFICULTIES.find((d) => d === item?.difficulty);
  return {
    name_ar: s(item?.name_ar),
    name_en: s(item?.name_en),
    // Undefined (no chip selected) on create — the point of "required".
    muscle_group: muscle as ExerciseFormValues["muscle_group"],
    measurement_type: normalizeMeasurementType(item?.measurement_type),
    difficulty,
    equipment: s(item?.equipment),
    skill_group: (item?.skill_group ?? "") as ExerciseFormValues["skill_group"],
    skill_level: item?.skill_level ?? undefined,
    video_url: s(item?.video_url),
    image_url: s(item?.image_url),
    thumbnail_url: s(item?.thumbnail_url),
    video_url_alt: s(item?.video_url_alt),
    instructions_ar: s(item?.instructions_ar),
    instructions_en: s(item?.instructions_en),
    cues_ar: a(item?.cues_ar),
    cues_en: a(item?.cues_en),
    steps_ar: a(item?.steps_ar),
    steps_en: a(item?.steps_en),
    mistakes_ar: a(item?.mistakes_ar),
    mistakes_en: a(item?.mistakes_en),
    safety_ar: s(item?.safety_ar),
    safety_en: s(item?.safety_en),
    tempo: s(item?.tempo),
    primary_muscles: a(item?.primary_muscles),
    secondary_muscles: a(item?.secondary_muscles),
    coach_notes_ar: s(item?.coach_notes_ar),
    coach_notes_en: s(item?.coach_notes_en),
  };
}

/** The wire format the actions already parse: lists newline-joined, empty
 * values omitted (the update action turns omitted into "clear"). */
export function toFormData(
  values: ExerciseFormValues,
  opts: { mode: "create" | "clone" | "edit"; sourceId?: string }
): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      const joined = cleanRows(value).join("\n");
      if (joined) fd.set(key, joined);
    } else if (typeof value === "number") {
      fd.set(key, String(value));
    } else if (typeof value === "string" && value.trim()) {
      fd.set(key, value.trim());
    }
  }
  // Provenance is set once, at clone time — never on edit.
  if (opts.mode === "clone" && opts.sourceId) fd.set("source_exercise_id", opts.sourceId);
  return fd;
}

// ---------------------------------------------------------------------------
// Tempo: eccentric - pause - concentric - pause, stored as "3-1-1-0".
// ---------------------------------------------------------------------------

export type TempoBoxes = [string, string, string, string];

export function splitTempo(tempo: string | null | undefined): TempoBoxes {
  const v = (tempo ?? "").trim().toUpperCase();
  const dashed = v.match(/^([0-9X]{1,2})-([0-9X]{1,2})-([0-9X]{1,2})-([0-9X]{1,2})$/);
  if (dashed) return [dashed[1], dashed[2], dashed[3], dashed[4]];
  // Plain "3010" is the other common way to write it.
  if (/^[0-9X]{4}$/.test(v)) return [v[0], v[1], v[2], v[3]];
  return ["", "", "", ""];
}

/** All empty → "" (no tempo). Otherwise a blank box means "no pause" = 0. */
export function joinTempo(boxes: readonly string[]): string {
  if (boxes.every((b) => !b)) return "";
  return boxes.map((b) => b || "0").join("-");
}

/** One digit-or-X box, at most 2 chars. */
export function sanitizeTempoBox(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9X]/g, "").slice(0, 2);
}

// ---------------------------------------------------------------------------
// Sections.
// ---------------------------------------------------------------------------

export const SECTION_IDS = ["basics", "media", "instructions", "extra"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** Fields per section, in the order they appear on screen. */
export const SECTION_FIELDS: Record<SectionId, readonly FieldName[]> = {
  basics: ["name_ar", "name_en", "muscle_group", "measurement_type", "difficulty", "equipment", "skill_group", "skill_level"],
  media: ["video_url", "image_url", "thumbnail_url", "video_url_alt"],
  instructions: [
    "instructions_ar", "instructions_en", "cues_ar", "cues_en", "steps_ar", "steps_en",
    "mistakes_ar", "mistakes_en", "safety_ar", "safety_en",
  ],
  extra: ["tempo", "primary_muscles", "secondary_muscles", "coach_notes_ar", "coach_notes_en"],
};

export function sectionOfField(name: string): SectionId | null {
  return SECTION_IDS.find((id) => (SECTION_FIELDS[id] as readonly string[]).includes(name)) ?? null;
}

export type ContentLang = "ar" | "en";

const langOf = (field: string): ContentLang | null =>
  field.endsWith("_ar") ? "ar" : field.endsWith("_en") ? "en" : null;

/** Where a failed submit should send the coach: the first section (in nav
 * order) that has an error, the first field in it — preferring the language
 * they're already editing, so a missing English name doesn't yank them to
 * Arabic first — and the language that field belongs to. */
export function firstErrorTarget(
  errorKeys: readonly string[],
  lang: ContentLang
): { section: SectionId; field: string; lang: ContentLang } | null {
  for (const section of SECTION_IDS) {
    const fields = SECTION_FIELDS[section].filter((f) => errorKeys.includes(f));
    if (fields.length === 0) continue;
    const field = fields.find((f) => langOf(f) === lang || langOf(f) === null) ?? fields[0];
    return { section, field, lang: langOf(field) ?? lang };
  }
  return null;
}

const isFilled = (v: unknown): boolean =>
  Array.isArray(v) ? cleanRows(v).length > 0 : typeof v === "string" ? v.trim() !== "" : v != null;

/** ar/en pairs per section. */
const PAIRS: Record<SectionId, readonly string[]> = {
  basics: ["name"],
  media: [],
  instructions: ["instructions", "cues", "steps", "mistakes", "safety"],
  extra: ["coach_notes"],
};

export type SectionStatus = { filled: number; total: number; bilingualGap: boolean };

export function sectionStatus(values: ExerciseFormValues): Record<SectionId, SectionStatus> {
  const get = (k: string) => (values as Record<string, unknown>)[k];
  const out = {} as Record<SectionId, SectionStatus>;
  for (const id of SECTION_IDS) {
    const bilingualGap = PAIRS[id].some((base) => isFilled(get(`${base}_ar`)) !== isFilled(get(`${base}_en`)));
    let filled = 0;
    let total = 0;
    if (id === "media") {
      total = SECTION_FIELDS.media.length;
      filled = SECTION_FIELDS.media.filter((f) => isFilled(get(f))).length;
    } else if (id === "instructions") {
      total = PAIRS.instructions.length;
      filled = PAIRS.instructions.filter((b) => isFilled(get(`${b}_ar`)) || isFilled(get(`${b}_en`))).length;
    }
    out[id] = { filled, total, bilingualGap };
  }
  return out;
}
