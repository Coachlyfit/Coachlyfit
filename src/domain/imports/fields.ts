import { z } from "zod";
import { MUSCLE_GROUPS } from "@/domain/library/taxonomy";

export type ImportType = "clients" | "exercises";
export type RowError = "missing_required" | "invalid_email" | "invalid_phone" | "invalid" | "duplicate";

export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type FieldDef = { key: string; required?: boolean; aliases: string[] };

/** Field keys double as the i18n keys under `imports.fields.*`. Aliases are
 * compared after normalizeHeader(), so casing, diacritics and أ/ا, ة/ه, ى/ي
 * variants don't need listing. */
export const FIELDS: Record<ImportType, FieldDef[]> = {
  clients: [
    { key: "displayName", required: true, aliases: ["name", "full name", "client name", "الاسم", "اسم العميل", "اسم"] },
    { key: "email", aliases: ["email", "e-mail", "email address", "البريد", "البريد الالكتروني", "الايميل", "ايميل"] },
    { key: "phone", aliases: ["phone", "mobile", "phone number", "whatsapp", "رقم الهاتف", "الهاتف", "الجوال", "رقم الجوال", "موبايل", "واتساب"] },
  ],
  exercises: [
    // Neither name is required alone: at least one must be mapped (see canContinue).
    { key: "name_ar", aliases: ["name ar", "name arabic", "arabic name", "الاسم بالعربي", "الاسم العربي", "اسم التمرين", "اسم التمرين بالعربي"] },
    { key: "name_en", aliases: ["name", "name en", "name english", "english name", "exercise", "exercise name", "الاسم بالانجليزي", "الاسم الانجليزي", "اسم التمرين بالانجليزي"] },
    { key: "muscle_group", aliases: ["muscle group", "muscle", "group", "المجموعه العضليه", "العضله", "المجموعه"] },
    { key: "equipment", aliases: ["equipment", "الادوات", "الجهاز", "المعدات"] },
    { key: "video_url", aliases: ["video", "video url", "video link", "الفيديو", "رابط الفيديو"] },
    { key: "instructions_ar", aliases: ["instructions ar", "التعليمات", "الشرح", "التعليمات بالعربي"] },
    { key: "instructions_en", aliases: ["instructions", "instructions en", "description", "التعليمات بالانجليزي"] },
  ],
};

export function normalizeHeader(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[ً-ٰٟـ]/g, "") // tashkeel + tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** field key -> column index (or null = not mapped). Exact alias match wins
 * over "header contains alias"; a column is claimed by at most one field. */
export type Mapping = Record<string, number | null>;

export function autoMap(headers: string[], type: ImportType): Mapping {
  const norm = headers.map(normalizeHeader);
  const claimed = new Set<number>();
  const mapping: Mapping = {};
  const fields = FIELDS[type];

  for (const field of fields) mapping[field.key] = null;

  for (const mode of ["exact", "contains"] as const) {
    for (const field of fields) {
      if (mapping[field.key] !== null) continue;
      const aliases = field.aliases.map(normalizeHeader);
      const idx = norm.findIndex(
        (h, i) =>
          !claimed.has(i) && h !== "" && aliases.some((a) => (mode === "exact" ? h === a : h.includes(a)))
      );
      if (idx >= 0) {
        mapping[field.key] = idx;
        claimed.add(idx);
      }
    }
  }
  return mapping;
}

/** Wizard gate: every required field mapped; exercises need one of the two names. */
export function canContinue(type: ImportType, mapping: Mapping): boolean {
  if (type === "exercises") return mapping.name_ar != null || mapping.name_en != null;
  return FIELDS[type].every((f) => !f.required || mapping[f.key] != null);
}

/** Maps raw sheet rows (arrays of cells) to field-keyed objects. */
export function applyMapping(type: ImportType, rows: string[][], mapping: Mapping): Record<string, string>[] {
  return rows.map((row) => {
    const out: Record<string, string> = {};
    for (const { key } of FIELDS[type]) {
      const idx = mapping[key];
      if (idx != null) out[key] = String(row[idx] ?? "").trim();
    }
    return out;
  });
}

// --- Google Sheets -------------------------------------------------------

/** Only https://docs.google.com/spreadsheets/d/{id}/… is accepted. The id and
 * gid are re-embedded into a URL we build ourselves; the user's string is
 * never fetched. Published-to-web links (/d/e/…) are rejected: different
 * export route, and "e" fails the id length check. */
export function parseSheetUrl(input: string): { id: string; gid: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") return null;
  const id = url.pathname.match(/^\/spreadsheets\/d\/([\w-]{20,})(?:\/|$)/)?.[1];
  if (!id) return null;
  const gid = url.searchParams.get("gid") ?? url.hash.match(/(?:^#|&)gid=(\d+)/)?.[1] ?? "0";
  if (!/^\d+$/.test(gid)) return null;
  return { id, gid };
}

export function sheetExportUrl({ id, gid }: { id: string; gid: string }): string {
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

// --- Row validation ------------------------------------------------------

const optionalText = (max: number) => z.string().max(max).optional();

// Same bounds as createInviteSchema (clients/schemas.ts).
const PHONE_CHARS = /^[\d+\s()-]+$/;
export const clientRowSchema = z.object({
  displayName: z.string().min(2).max(100),
  email: z.string().email().max(254).optional(),
  phone: z
    .string()
    .min(6)
    .max(30)
    .refine((v) => PHONE_CHARS.test(v) && v.replace(/\D/g, "").length >= 6)
    .optional(),
});

// Same bounds as createExerciseSchema (library/schemas.ts), minus the fields
// import doesn't carry.
export const exerciseRowSchema = z.object({
  name_ar: z.string().min(1).max(100),
  name_en: z.string().min(1).max(100),
  muscle_group: z.enum(MUSCLE_GROUPS).optional(),
  equipment: optionalText(50),
  video_url: z.string().url().optional(),
  instructions_ar: optionalText(2000),
  instructions_en: optionalText(2000),
});

export type ClientRow = z.infer<typeof clientRowSchema>;
export type ExerciseRow = z.infer<typeof exerciseRowSchema>;
export const ROW_SCHEMAS = { clients: clientRowSchema, exercises: exerciseRowSchema } as const;

/** Case/space-insensitive key; digits only for phones. */
const nameKey = (v: string) => normalizeHeader(v);

export function dedupeKeys(type: ImportType, row: Partial<ClientRow & ExerciseRow>): string[] {
  const keys: string[] = [];
  if (type === "clients") {
    if (row.email) keys.push(`e:${row.email.trim().toLowerCase()}`);
    const digits = row.phone?.replace(/\D/g, "");
    if (digits) keys.push(`p:${digits}`);
  } else {
    if (row.name_ar) keys.push(`n:${nameKey(row.name_ar)}`);
    if (row.name_en) keys.push(`n:${nameKey(row.name_en)}`);
  }
  return keys;
}

/** `labels`: normalized translated label -> MUSCLE_GROUPS key (built by the
 * caller from the current locale's messages). Unknown values are dropped, not
 * errors: muscle_group is optional and the coach can set it later. */
export function normalizeMuscleGroup(value: string | undefined, labels: Record<string, string> = {}) {
  if (!value) return undefined;
  const n = normalizeHeader(value);
  const key = n.replaceAll(" ", "_");
  if ((MUSCLE_GROUPS as readonly string[]).includes(key)) return key;
  return labels[n];
}

export type RowResult<T> = { ok: true; data: T } | { ok: false; errors: RowError[] };

function clean(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const t = (v ?? "").trim();
    if (t) out[k] = t;
  }
  return out;
}

/** Validates one row and marks duplicates against `seen` (existing keys plus
 * earlier accepted rows). Mutates `seen` only for rows it accepts, so an
 * invalid row never shadows a later good one. The server runs this again on
 * the payload; nothing from the browser is trusted. */
export function validateRow(
  type: ImportType,
  raw: Record<string, string>,
  seen: Set<string>,
  muscleLabels?: Record<string, string>
): RowResult<ClientRow | ExerciseRow> {
  const row = clean(raw);

  if (type === "exercises") {
    // One name is enough; the other copies it (both columns are NOT NULL).
    row.name_ar ??= row.name_en;
    row.name_en ??= row.name_ar;
    const group = normalizeMuscleGroup(row.muscle_group, muscleLabels);
    if (group) row.muscle_group = group;
    else delete row.muscle_group;
  }

  const requiredKey = type === "clients" ? "displayName" : "name_en";
  if (!row[requiredKey]) return { ok: false, errors: ["missing_required"] };

  const parsed = ROW_SCHEMAS[type].safeParse(row);
  if (!parsed.success) {
    const errors = new Set<RowError>();
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      errors.add(field === "email" ? "invalid_email" : field === "phone" ? "invalid_phone" : "invalid");
    }
    return { ok: false, errors: [...errors] };
  }

  const keys = dedupeKeys(type, parsed.data);
  if (keys.some((k) => seen.has(k))) return { ok: false, errors: ["duplicate"] };
  for (const k of keys) seen.add(k);
  return { ok: true, data: parsed.data };
}

export function validateRows(
  type: ImportType,
  rows: Record<string, string>[],
  existing: Iterable<string>,
  muscleLabels?: Record<string, string>
) {
  const seen = new Set(existing);
  return rows.map((r) => validateRow(type, r, seen, muscleLabels));
}
