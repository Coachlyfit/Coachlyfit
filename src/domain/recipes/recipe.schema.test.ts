import { describe, expect, it } from "vitest";
import { ingredientQuantitySchema, recipeSchema } from "./recipe.schema";
import { normalizeVideoUrl } from "./video-url";

const FOOD = "6f1c3c7e-2d4b-4a51-9f0e-1a2b3c4d5e6f";

const valid = {
  name_ar: "شوفان بالموز",
  name_en: "Banana oats",
  description: "",
  servings: "2",
  prep_minutes: "",
  cook_minutes: "10",
  ingredients: [{ food_id: FOOD, quantity: "80", unit: "g", note: "" }],
  steps: [{ text: "Boil the milk" }],
  tags: ["breakfast"],
  video_url: "",
  image_path: "",
};

function firstError(input: unknown, path: string) {
  const result = recipeSchema.safeParse(input);
  if (result.success) return null;
  return result.error.issues.find((i) => i.path.join(".") === path)?.message ?? null;
}

describe("recipeSchema", () => {
  it("parses a valid form and maps blanks to null", () => {
    const out = recipeSchema.parse(valid);
    expect(out).toMatchObject({
      servings: 2,
      prep_minutes: null,
      cook_minutes: 10,
      description: null,
      video_url: null,
      image_path: null,
      ingredients: [{ food_id: FOOD, quantity: 80, unit: "g", note: null }],
    });
  });

  it("accepts its own output (the server re-parses what the client sent)", () => {
    const out = recipeSchema.parse(valid);
    expect(recipeSchema.parse(out)).toEqual(out);
  });

  it("names", () => {
    expect(firstError({ ...valid, name_en: "  " }, "name_en")).toBe("name_required");
    expect(firstError({ ...valid, name_en: "a" }, "name_en")).toBe("name_too_short");
    expect(firstError({ ...valid, name_ar: "x".repeat(81) }, "name_ar")).toBe("name_too_long");
  });

  it("description, servings and minutes", () => {
    expect(firstError({ ...valid, description: "x".repeat(301) }, "description")).toBe("description_too_long");
    expect(firstError({ ...valid, servings: "0" }, "servings")).toBe("servings_range");
    expect(firstError({ ...valid, servings: "21" }, "servings")).toBe("servings_range");
    expect(firstError({ ...valid, servings: "1.5" }, "servings")).toBe("servings_invalid");
    expect(firstError({ ...valid, cook_minutes: "601" }, "cook_minutes")).toBe("minutes_range");
    expect(recipeSchema.parse({ ...valid, servings: "٣", prep_minutes: "١٥" })).toMatchObject({
      servings: 3,
      prep_minutes: 15,
    });
  });

  it("ingredients", () => {
    expect(firstError({ ...valid, ingredients: [] }, "ingredients")).toBe("ingredients_required");
    const many = Array.from({ length: 41 }, () => valid.ingredients[0]);
    expect(firstError({ ...valid, ingredients: many }, "ingredients")).toBe("ingredients_too_many");
    const row = (patch: object) => ({ ...valid, ingredients: [{ ...valid.ingredients[0], ...patch }] });
    expect(firstError(row({ food_id: "" }), "ingredients.0.food_id")).toBe("ingredient_food_required");
    expect(firstError(row({ unit: "cup" }), "ingredients.0.unit")).toBe("ingredient_unit_invalid");
    expect(firstError(row({ note: "x".repeat(61) }), "ingredients.0.note")).toBe("ingredient_note_too_long");
  });

  it("steps: blanks dropped, length and count enforced", () => {
    const out = recipeSchema.parse({ ...valid, steps: [{ text: "  " }, { text: " Stir well " }, { text: "" }] });
    expect(out.steps).toEqual([{ text: "Stir well" }]);
    expect(firstError({ ...valid, steps: [{ text: "ab" }] }, "steps.0.text")).toBe("step_too_short");
    // The error stays on the row the coach sees, even after a blank row.
    expect(firstError({ ...valid, steps: [{ text: "" }, { text: "ab" }] }, "steps.1.text")).toBe("step_too_short");
    expect(firstError({ ...valid, steps: [{ text: "x".repeat(501) }] }, "steps.0.text")).toBe("step_too_long");
    const many = Array.from({ length: 31 }, () => ({ text: "Do it" }));
    expect(firstError({ ...valid, steps: many }, "steps")).toBe("steps_too_many");
  });

  it("tags: trimmed, deduped, bounded", () => {
    expect(recipeSchema.parse({ ...valid, tags: [" Vegan ", "vegan", "", "keto"] }).tags).toEqual(["Vegan", "keto"]);
    expect(firstError({ ...valid, tags: ["x".repeat(25)] }, "tags.0")).toBe("tag_too_long");
    const many = Array.from({ length: 9 }, (_, i) => `t${i}`);
    expect(firstError({ ...valid, tags: many }, "tags")).toBe("tags_too_many");
  });

  it("video url is normalized or rejected", () => {
    expect(recipeSchema.parse({ ...valid, video_url: "https://youtu.be/dQw4w9WgXcQ?si=abc" }).video_url).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );
    expect(firstError({ ...valid, video_url: "https://example.com/v" }, "video_url")).toBe("video_unsupported");
  });
});

describe("ingredientQuantitySchema", () => {
  const parse = (v: unknown) => ingredientQuantitySchema.safeParse(v);
  const message = (v: unknown) => {
    const r = parse(v);
    return r.success ? null : r.error.issues[0].message;
  };

  it("accepts Arabic-Indic and Persian digits and the Arabic decimal separator", () => {
    expect(parse("١٥٠").data).toBe(150);
    expect(parse("۲٫۵").data).toBe(2.5);
    expect(parse("1.25").data).toBe(1.25);
    expect(parse(80).data).toBe(80);
  });

  it("rejects with a specific reason", () => {
    expect(message("")).toBe("quantity_required");
    expect(message("abc")).toBe("quantity_invalid");
    expect(message("1,5")).toBe("quantity_invalid");
    expect(message("1.255")).toBe("quantity_decimals");
    expect(message("0")).toBe("quantity_positive");
    expect(message("5000.01")).toBe("quantity_too_large");
  });
});

describe("normalizeVideoUrl", () => {
  it.each([
    ["https://youtu.be/dQw4w9WgXcQ?si=track", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=x&t=10", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
    ["https://youtube.com/shorts/dQw4w9WgXcQ?feature=share", "https://www.youtube.com/shorts/dQw4w9WgXcQ", "youtube"],
    ["youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
    ["https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=xyz", "https://www.instagram.com/reel/C1a2B3c4D5e/", "instagram"],
    ["https://instagram.com/p/C1a2B3c4D5e", "https://www.instagram.com/p/C1a2B3c4D5e/", "instagram"],
    ["https://www.tiktok.com/@chef/video/7234567890123456789?lang=en", "https://www.tiktok.com/@chef/video/7234567890123456789", "tiktok"],
    ["https://vm.tiktok.com/ZMabc123/", "https://vm.tiktok.com/ZMabc123/", "tiktok"],
    ["https://vimeo.com/76979871", "https://vimeo.com/76979871", "vimeo"],
    ["https://player.vimeo.com/video/76979871?h=abc", "https://vimeo.com/76979871", "vimeo"],
  ])("%s", (input, url, platform) => {
    expect(normalizeVideoUrl(input)).toEqual({ url, platform });
  });

  it.each([
    "http://youtu.be/dQw4w9WgXcQ",
    "https://evil.com/youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/channel/UC123",
    "https://www.youtube.com/watch?v=short",
    "https://www.instagram.com/someone/",
    "javascript:alert(1)",
    "",
  ])("rejects %s", (input) => {
    expect(normalizeVideoUrl(input)).toBeNull();
  });
});
