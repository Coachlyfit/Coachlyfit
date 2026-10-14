import { describe, expect, it } from "vitest";
import { RecipesService } from "./recipes.service";
import type { RecipeInput } from "./recipe.schema";

type Call = { table: string; method: string; args: unknown[] };

/** Every from()/rpc() call takes the next queued response; any chain of
 * builder methods on it is recorded and the chain resolves to that response
 * when awaited. */
function fakeSupabase(responses: unknown[]) {
  const calls: Call[] = [];
  const chainFor = (table: string, response: unknown): object => {
    const chain: object = new Proxy(
      {},
      {
        get(_target, method) {
          if (method === "then") return (resolve: (v: unknown) => void) => resolve(response);
          return (...args: unknown[]) => {
            calls.push({ table, method: String(method), args });
            return chain;
          };
        },
      }
    );
    return chain;
  };
  const db = {
    from: (table: string) => chainFor(table, responses.shift()),
    rpc: (fn: string, args: unknown) => {
      calls.push({ table: "rpc", method: fn, args: [args] });
      return Promise.resolve(responses.shift());
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          calls.push({ table: "storage", method: "remove", args: [paths] });
          return { error: null };
        },
      }),
    },
  };
  return { db: db as never, calls };
}

const FOOD = "6f1c3c7e-2d4b-4a51-9f0e-1a2b3c4d5e6f";
const input: RecipeInput = {
  name_ar: "شوفان",
  name_en: "Oats",
  description: null,
  servings: 1,
  prep_minutes: null,
  cook_minutes: null,
  ingredients: [{ food_id: FOOD, quantity: 80, unit: "g", note: null }],
  steps: [{ text: "Mix it" }],
  tags: [],
  video_url: null,
  image_path: null,
};

describe("RecipesService.save", () => {
  it("rejects a gram amount of a food whose serving isn't a gram amount, pointing at the row", async () => {
    const { db, calls } = fakeSupabase([{ data: [{ id: FOOD, serving_label: "1 cup" }], error: null }]);
    const result = await new RecipesService(db).save(null, input);
    expect(result).toEqual({ error: "ingredient_unit_invalid", index: 0 });
    expect(calls.some((c) => c.table === "rpc")).toBe(false);
  });

  it("rejects a food the coach can't see", async () => {
    const { db } = fakeSupabase([{ data: [], error: null }]);
    expect(await new RecipesService(db).save(null, input)).toEqual({ error: "ingredient_food_unavailable", index: 0 });
  });

  it("saves through the save_recipe RPC with steps as plain strings", async () => {
    const { db, calls } = fakeSupabase([
      { data: [{ id: FOOD, serving_label: "100g" }], error: null },
      { data: "recipe-1", error: null },
    ]);
    expect(await new RecipesService(db).save(null, input)).toEqual({ id: "recipe-1" });
    const rpc = calls.find((c) => c.table === "rpc");
    expect(rpc?.args[0]).toMatchObject({
      p_recipe: { name_en: "Oats", steps: ["Mix it"] },
      p_ingredients: [{ food_id: FOOD, quantity: 80, unit: "g", note: null }],
    });
  });

  it("deletes the replaced image after a successful edit", async () => {
    const { db, calls } = fakeSupabase([
      { data: [{ id: FOOD, serving_label: "100g" }], error: null },
      { data: { image_path: "coach-1/old.webp" }, error: null },
      { data: "recipe-1", error: null },
    ]);
    await new RecipesService(db).save("recipe-1", { ...input, image_path: "coach-1/new.webp" });
    expect(calls.find((c) => c.table === "storage")?.args[0]).toEqual(["coach-1/old.webp"]);
  });
});

describe("RecipesService.remove", () => {
  it("hard-deletes an unused recipe and its image", async () => {
    const { db, calls } = fakeSupabase([
      { data: { image_path: "coach-1/a.webp" }, error: null },
      { data: [{ id: "recipe-1" }], error: null },
    ]);
    expect(await new RecipesService(db).remove("recipe-1")).toBe("deleted");
    expect(calls.find((c) => c.table === "storage")?.args[0]).toEqual(["coach-1/a.webp"]);
  });

  it("archives a recipe a plan still references, keeping its image", async () => {
    const { db, calls } = fakeSupabase([
      { data: { image_path: "coach-1/a.webp" }, error: null },
      { data: null, error: { code: "23503" } },
      { data: [{ id: "recipe-1" }], error: null },
    ]);
    expect(await new RecipesService(db).remove("recipe-1")).toBe("archived");
    expect(calls.find((c) => c.method === "update")?.args[0]).toHaveProperty("archived_at");
    expect(calls.some((c) => c.table === "storage")).toBe(false);
  });

  it("reports not_found when RLS hides the row", async () => {
    const { db } = fakeSupabase([
      { data: null, error: null },
      { data: [], error: null },
    ]);
    expect(await new RecipesService(db).remove("recipe-x")).toBe("not_found");
  });
});
