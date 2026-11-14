import type { Tables } from "@/lib/supabase/database.types";
import { formatNumber } from "@/lib/format";
import { pickLocale, type AppLocale } from "@/domain/locale";

/** The columns every plan card needs. subscription_tiers is the one plan
 * catalogue: marketing, the coach's subscription page and admin all read it. */
export const PLAN_TIER_COLUMNS =
  "id, key, name_ar, name_en, description_ar, description_en, price_egp_monthly, max_clients, max_team_members, features";

export type PlanTier = Pick<
  Tables<"subscription_tiers">,
  | "id"
  | "key"
  | "name_ar"
  | "name_en"
  | "description_ar"
  | "description_en"
  | "price_egp_monthly"
  | "max_clients"
  | "max_team_members"
  | "features"
>;

/** A plan family: New Coach (starter), Ambitious Coach (pro), Pro Coach
 * (elite). Only Pro Coach has more than one tier (its client-count steps). */
export type PlanKey = "starter" | "pro" | "elite";
export type PlanGroup = { key: PlanKey; tiers: PlanTier[] };

const PLAN_ORDER: readonly PlanKey[] = ["starter", "pro", "elite"];
export const POPULAR_PLAN: PlanKey = "pro";

// No cap is null. Rows seeded before 20261015000001 carried 999999 instead.
const UNLIMITED_THRESHOLD = 100_000;

export function isUnlimited(max: number | null | undefined): boolean {
  return max == null || max >= UNLIMITED_THRESHOLD;
}

/** Families in display order, each with its tiers cheapest first. A key the
 * app doesn't know is dropped rather than rendered half-described. */
export function groupPlans(tiers: PlanTier[]): PlanGroup[] {
  return PLAN_ORDER.flatMap((key) => {
    const own = tiers.filter((tier) => tier.key === key).sort((a, b) => a.price_egp_monthly - b.price_egp_monthly);
    return own.length > 0 ? [{ key, tiers: own }] : [];
  });
}

/** A tier's name, with its client count for Pro Coach: those tiers all share
 * one name, so the name alone doesn't say which plan was picked or requested.
 * `t` is the "plans" message namespace. */
export function tierTitle(
  tier: Pick<PlanTier, "key" | "name_ar" | "name_en" | "max_clients">,
  locale: AppLocale,
  t: (key: "clients" | "clientsUnlimited", values?: { count: string }) => string
): string {
  const name = pickLocale(tier, locale);
  if (tier.key !== "elite") return name;
  const clients = isUnlimited(tier.max_clients)
    ? t("clientsUnlimited")
    : t("clients", { count: formatNumber(tier.max_clients ?? 0, locale) });
  return `${name} · ${clients}`;
}

const ALWAYS = [
  "foodLibrary",
  "exerciseLibrary",
  "clientPortal",
  "teamManagement",
  "rolePermissions",
  "clientAssignment",
] as const;

const BY_FLAG = [
  ["custom_branding", "customBranding"],
  ["priority_support", "prioritySupport"],
] as const;

export type PlanBullet = (typeof ALWAYS)[number] | (typeof BY_FLAG)[number][1];

/** Message keys (plans.features.*) for what a tier includes: the shared core
 * plus whatever its feature flags switch on. */
export function planBullets(features: PlanTier["features"]): PlanBullet[] {
  const flags = (features ?? {}) as Record<string, boolean>;
  return [...ALWAYS, ...BY_FLAG.filter(([flag]) => flags[flag]).map(([, bullet]) => bullet)];
}
