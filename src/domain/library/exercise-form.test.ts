import { describe, expect, it } from "vitest";
import {
  exerciseFormSchema,
  firstErrorTarget,
  joinTempo,
  sanitizeTempoBox,
  sectionOfField,
  sectionStatus,
  splitTempo,
  toFormData,
  toFormValues,
  type ExerciseFormValues,
} from "./exercise-form";

const valid = (over: Partial<ExerciseFormValues> = {}): ExerciseFormValues => ({
  ...toFormValues(),
  name_ar: "قرفصاء",
  name_en: "Squat",
  muscle_group: "legs",
  ...over,
});

describe("tempo", () => {
  it("splits and joins the dashed format", () => {
    expect(splitTempo("3-1-1-0")).toEqual(["3", "1", "1", "0"]);
    expect(joinTempo(["3", "1", "1", "0"])).toBe("3-1-1-0");
  });

  it("reads the plain 4-char form and explosive X, case-insensitively", () => {
    expect(splitTempo("3010")).toEqual(["3", "0", "1", "0"]);
    expect(splitTempo("2-0-x-0")).toEqual(["2", "0", "X", "0"]);
  });

  it("treats anything else as empty", () => {
    expect(splitTempo("")).toEqual(["", "", "", ""]);
    expect(splitTempo(null)).toEqual(["", "", "", ""]);
    expect(splitTempo("slow")).toEqual(["", "", "", ""]);
  });

  it("all-empty boxes mean no tempo; a partial fill pads with 0", () => {
    expect(joinTempo(["", "", "", ""])).toBe("");
    expect(joinTempo(["3", "", "1", ""])).toBe("3-0-1-0");
  });

  it("sanitizes a box to digits/X, max 2 chars", () => {
    expect(sanitizeTempoBox("a1x9")).toBe("1X");
    expect(sanitizeTempoBox("")).toBe("");
  });
});

describe("toFormValues / toFormData", () => {
  it("round-trips lists as the newline-joined wire format, cues included", () => {
    const values = toFormValues({
      name_ar: "قرفصاء",
      name_en: "Squat",
      muscle_group: "legs",
      cues_en: ["Chest up", "Knees out"],
      steps_ar: ["خطوة ١"],
      primary_muscles: ["quads", "glutes"],
      tempo: "3-1-1-0",
    });
    const fd = toFormData(values, { mode: "edit" });
    expect(fd.get("cues_en")).toBe("Chest up\nKnees out");
    expect(fd.get("steps_ar")).toBe("خطوة ١");
    expect(fd.get("primary_muscles")).toBe("quads\nglutes");
    expect(fd.get("tempo")).toBe("3-1-1-0");
    expect(fd.get("muscle_group")).toBe("legs");
  });

  it("drops blank rows and omits empty fields", () => {
    const fd = toFormData(valid({ cues_en: ["  ", ""], equipment: "  " }), { mode: "create" });
    expect(fd.has("cues_en")).toBe(false);
    expect(fd.has("equipment")).toBe(false);
    expect(fd.has("source_exercise_id")).toBe(false);
  });

  it("sets provenance only when cloning", () => {
    expect(toFormData(valid(), { mode: "clone", sourceId: "g1" }).get("source_exercise_id")).toBe("g1");
    expect(toFormData(valid(), { mode: "edit", sourceId: "g1" }).has("source_exercise_id")).toBe(false);
  });

  it("starts a new exercise with no muscle group, and the default measurement", () => {
    const v = toFormValues();
    expect(v.muscle_group).toBeUndefined();
    expect(v.measurement_type).toBe("weight_reps");
  });

  it("ignores a legacy muscle group outside the vocabulary", () => {
    expect(toFormValues({ muscle_group: "Quadriceps" }).muscle_group).toBeUndefined();
  });

  it("sends skill_level as a number string", () => {
    const fd = toFormData(valid({ skill_group: "planche", skill_level: 2 }), { mode: "create" });
    expect(fd.get("skill_level")).toBe("2");
  });
});

describe("exerciseFormSchema", () => {
  it("accepts a minimal valid exercise", () => {
    expect(exerciseFormSchema.safeParse(valid()).success).toBe(true);
  });

  it("requires a muscle group", () => {
    const r = exerciseFormSchema.safeParse(valid({ muscle_group: undefined }));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["muscle_group"]);
  });

  it("requires both names, with i18n-key messages", () => {
    const r = exerciseFormSchema.safeParse(valid({ name_en: "  " }));
    expect(r.error?.issues[0]).toMatchObject({ path: ["name_en"], message: "required" });
  });

  it("flags a skill group without a level (and the reverse)", () => {
    const a = exerciseFormSchema.safeParse(valid({ skill_group: "planche" }));
    expect(a.error?.issues[0]).toMatchObject({ path: ["skill_level"], message: "skillIncomplete" });
    const b = exerciseFormSchema.safeParse(valid({ skill_level: 3 }));
    expect(b.error?.issues[0]).toMatchObject({ path: ["skill_level"], message: "skillIncomplete" });
    expect(exerciseFormSchema.safeParse(valid({ skill_group: "planche", skill_level: 3 })).success).toBe(true);
  });

  it("rejects a bad URL but allows an empty one", () => {
    expect(exerciseFormSchema.safeParse(valid({ video_url: "not a url" })).error?.issues[0].message).toBe("invalidUrl");
    expect(exerciseFormSchema.safeParse(valid({ video_url: "" })).success).toBe(true);
  });

  it("keeps a list under the server's joined-length ceiling", () => {
    const long = Array.from({ length: 12 }, () => "x".repeat(100));
    expect(exerciseFormSchema.safeParse(valid({ cues_en: long })).error?.issues[0].message).toBe("tooLong");
  });
});

describe("sections", () => {
  it("maps fields to their section", () => {
    expect(sectionOfField("name_en")).toBe("basics");
    expect(sectionOfField("thumbnail_url")).toBe("media");
    expect(sectionOfField("cues_ar")).toBe("instructions");
    expect(sectionOfField("tempo")).toBe("extra");
    expect(sectionOfField("nope")).toBeNull();
  });

  it("counts media and instruction slots as filled when either language has them", () => {
    const s = sectionStatus(
      valid({ video_url: "https://a.b/c", cues_ar: ["x"], steps_en: ["y"], instructions_en: "z" })
    );
    expect(s.media).toMatchObject({ filled: 1, total: 4 });
    expect(s.instructions).toMatchObject({ filled: 3, total: 5 });
  });

  it("flags a bilingual gap only when exactly one side is filled", () => {
    expect(sectionStatus(valid()).instructions.bilingualGap).toBe(false);
    expect(sectionStatus(valid({ cues_ar: ["x"] })).instructions.bilingualGap).toBe(true);
    expect(sectionStatus(valid({ cues_ar: ["x"], cues_en: ["y"] })).instructions.bilingualGap).toBe(false);
    expect(sectionStatus(valid({ coach_notes_en: "n" })).extra.bilingualGap).toBe(true);
    // blank rows don't count as filled
    expect(sectionStatus(valid({ cues_ar: ["  "] })).instructions.bilingualGap).toBe(false);
  });

  it("jumps to the first section with an error, in the current language when possible", () => {
    expect(firstErrorTarget(["video_url", "name_en"], "ar")).toEqual({ section: "basics", field: "name_en", lang: "en" });
    expect(firstErrorTarget(["name_ar", "name_en"], "en")).toEqual({ section: "basics", field: "name_en", lang: "en" });
    expect(firstErrorTarget(["name_ar", "muscle_group"], "en")).toEqual({
      section: "basics",
      field: "muscle_group",
      lang: "en",
    });
    expect(firstErrorTarget(["tempo", "cues_ar"], "en")).toEqual({ section: "instructions", field: "cues_ar", lang: "ar" });
    expect(firstErrorTarget([], "ar")).toBeNull();
  });
});
