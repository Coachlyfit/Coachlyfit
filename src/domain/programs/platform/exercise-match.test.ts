import { describe, expect, it } from "vitest";
import { gifKey, matchEquivalent, matchExercise, normalizeName, type GlobalExercise } from "./exercise-match";

const globals: GlobalExercise[] = [
  { id: "1", name_en: "Barbell Bench Press", video_url: "https://x.com/wp-content/uploads/2021/02/bench-press.gif" },
  { id: "2", name_en: "Push-Up", video_url: null },
  { id: "3", name_en: "Dumbbell Lateral Raises", video_url: null },
  { id: "4", name_en: "Plank", video_url: "https://x.com/2021/02/plank.gif" },
  { id: "5", name_en: "Lunge", video_url: null },
];

describe("normalizeName", () => {
  it("ignores case and punctuation", () => {
    expect(normalizeName("Push-Up")).toBe(normalizeName("push up"));
  });
  it("ignores word order", () => {
    expect(normalizeName("Bench Press Barbell")).toBe(normalizeName("Barbell Bench Press"));
  });
  it("ignores singular/plural", () => {
    expect(normalizeName("Lateral Raise Dumbbell")).toBe(normalizeName("Dumbbell Lateral Raises"));
    expect(normalizeName("Lunges")).toBe(normalizeName("Lunge"));
    expect(normalizeName("Crunches")).toBe(normalizeName("Crunch"));
    expect(normalizeName("Flies")).toBe(normalizeName("Fly"));
  });
  it("drops (male)/(female) and version markers", () => {
    expect(normalizeName("Plank (Male)")).toBe(normalizeName("Plank"));
    expect(normalizeName("Plank v. 2")).toBe(normalizeName("Plank"));
    expect(normalizeName("Plank V2")).toBe(normalizeName("Plank"));
  });
  it("keeps words that merely end in s", () => {
    expect(normalizeName("Triceps Press")).not.toBe(normalizeName("Tricep Pressing"));
    expect(normalizeName("Glass")).toBe("glass");
  });
});

describe("gifKey", () => {
  it("takes the file name without query or extension", () => {
    expect(gifKey("https://a.com/2021/02/Plank.gif?ver=2")).toBe("plank");
    expect(gifKey(null)).toBeNull();
  });
});

describe("matchEquivalent", () => {
  const lib: GlobalExercise[] = [
    { id: "a", name_en: "barbell romanian deadlift", video_url: null },
    { id: "b", name_en: "dumbbell romanian deadlift", video_url: null },
    { id: "c", name_en: "dumbbell hammer curl", video_url: null },
    { id: "d", name_en: "dumbbell hammer curl v. 2", video_url: null },
    { id: "e", name_en: "Pec Deck Fly (Machine Fly)", video_url: null },
    { id: "f", name_en: "Cat-Cow", video_url: null },
    { id: "g", name_en: "dumbbell lying one arm pronated triceps extension", video_url: null },
    { id: "h", name_en: "Seated Leg Curl", video_url: null },
    { id: "i", name_en: "lever lying leg curl", video_url: null },
  ];
  it("uses the site's equipment to pick between equipment variants", () => {
    expect(matchEquivalent({ name: "Romanian Deadlift", equipment: ["Barbell", "Full Gym"] }, lib)?.id).toBe("a");
    expect(matchEquivalent({ name: "Romanian Deadlift", equipment: ["Dumbbell"] }, lib)?.id).toBe("b");
  });
  it("prefers the plain name over its 'v. 2'", () => {
    expect(matchEquivalent({ name: "Hammer Curl", equipment: ["Dumbbell"] }, lib)?.id).toBe("c");
  });
  it("ignores parentheticals, 'pose' and hyphens", () => {
    expect(matchEquivalent({ name: "Pec Deck Fly", equipment: ["Machine"] }, lib)?.id).toBe("e");
    expect(matchEquivalent({ name: "Cat Cow Pose" }, lib)?.id).toBe("f");
  });
  it("never adds equipment the site's exercise doesn't use", () => {
    const l: GlobalExercise[] = [
      { id: "1", name_en: "barbell glute bridge", video_url: null },
      { id: "2", name_en: "smith sumo squat", video_url: null },
      { id: "3", name_en: "Cable Rear Delt Fly", video_url: null },
      { id: "4", name_en: "seated side crunch (wall)", video_url: null },
      { id: "5", name_en: "cable seated rear lateral raise", video_url: null },
    ];
    expect(matchEquivalent({ name: "Glute Bridge", equipment: ["Full Gym", "NO EQUIPMENT"] }, l)).toBeNull();
    expect(matchEquivalent({ name: "Bodyweight Sumo Squat", equipment: ["NO EQUIPMENT"] }, l)).toBeNull();
    expect(matchEquivalent({ name: "Rear Delt Fly Machine", equipment: ["Machine"] }, l)).toBeNull();
    expect(matchEquivalent({ name: "Seated Side Crunch", equipment: ["NO EQUIPMENT"] }, l)).toBeNull();
    expect(matchEquivalent({ name: "Seated Rear Lateral Dumbbell Raise", equipment: ["Dumbbells"] }, l)).toBeNull();
  });
  it("still maps when the library side only adds the site's own equipment", () => {
    const l: GlobalExercise[] = [{ id: "1", name_en: "lever lying leg curl", video_url: null }];
    expect(matchEquivalent({ name: "Lying Leg Curl", equipment: ["Machine"] }, l)?.id).toBe("1");
  });
  it("refuses an ambiguous pick and a different movement", () => {
    expect(matchEquivalent({ name: "Romanian Deadlift" }, lib)).toBeNull();
    expect(matchEquivalent({ name: "Leg Curl" }, lib)).toBeNull();
    expect(matchEquivalent({ name: "One-Arm Lying Triceps Extension" }, lib)).toBeNull();
    expect(matchEquivalent({ name: "Barbell" }, lib)).toBeNull();
  });
});

describe("matchExercise", () => {
  it("prefers the gif over the name", () => {
    const m = matchExercise({ name: "Something Else", gif: "https://y.com/other/plank.gif" }, globals);
    expect(m).toEqual({ id: "4", name_en: "Plank", via: "gif" });
  });
  it("falls back to the normalized name", () => {
    const m = matchExercise({ name: "Lateral Raise Dumbbell (Male)" }, globals);
    expect(m).toEqual({ id: "3", name_en: "Dumbbell Lateral Raises", via: "name" });
  });
  it("returns null instead of guessing", () => {
    expect(matchExercise({ name: "Zercher Squat" }, globals)).toBeNull();
    expect(matchExercise({ name: "   " }, globals)).toBeNull();
  });
});
