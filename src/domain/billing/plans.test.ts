import { describe, expect, it } from "vitest";
import { groupPlans, isUnlimited, planBullets, type PlanTier } from "./plans";

function tier(key: string, price: number, features: Record<string, boolean> = {}): PlanTier {
  return {
    id: `${key}-${price}`,
    key,
    name_ar: "",
    name_en: "",
    description_ar: null,
    description_en: null,
    price_egp_monthly: price,
    max_clients: null,
    max_team_members: null,
    features,
  };
}

describe("isUnlimited", () => {
  it("treats null as no cap", () => {
    expect(isUnlimited(null)).toBe(true);
  });

  it("treats the old 999999 sentinel as no cap", () => {
    expect(isUnlimited(999_999)).toBe(true);
  });

  it("keeps a real cap, including a big one", () => {
    expect(isUnlimited(30)).toBe(false);
    expect(isUnlimited(10_000)).toBe(false);
  });
});

describe("groupPlans", () => {
  it("orders families starter, pro, elite regardless of input order", () => {
    const groups = groupPlans([tier("elite", 1999), tier("starter", 499), tier("pro", 999)]);
    expect(groups.map((g) => g.key)).toEqual(["starter", "pro", "elite"]);
  });

  it("sorts a family's tiers cheapest first", () => {
    const [group] = groupPlans([tier("elite", 4999), tier("elite", 1999), tier("elite", 19999)]);
    expect(group.tiers.map((t) => t.price_egp_monthly)).toEqual([1999, 4999, 19999]);
  });

  it("drops a family with no tiers and a key it doesn't know", () => {
    const groups = groupPlans([tier("pro", 999), tier("legacy", 1)]);
    expect(groups.map((g) => g.key)).toEqual(["pro"]);
  });
});

describe("planBullets", () => {
  it("always lists the shared core", () => {
    expect(planBullets({})).toEqual([
      "foodLibrary",
      "exerciseLibrary",
      "clientPortal",
      "teamManagement",
      "rolePermissions",
      "clientAssignment",
    ]);
  });

  it("adds branding and priority support only when the flags are on", () => {
    expect(planBullets({ custom_branding: true })).toContain("customBranding");
    expect(planBullets({ custom_branding: true })).not.toContain("prioritySupport");
    expect(planBullets({ custom_branding: true, priority_support: true }).slice(-2)).toEqual([
      "customBranding",
      "prioritySupport",
    ]);
  });

  it("copes with a null features column", () => {
    expect(planBullets(null)).toHaveLength(6);
  });
});
