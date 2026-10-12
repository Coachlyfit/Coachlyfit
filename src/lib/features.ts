import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** Plan feature flags the app gates on. priority_support is display-only
 * and custom_branding has its own read (lib/branding.ts). */
export type PlanFeature = "forms_builder" | "custom_library" | "white_label";

/** The viewer's tenant's plan flags, to hide or disable what the plan doesn't
 * include. Display only: the triggers in
 * 20261018000001_enforce_tier_features.sql are the enforcement, so a wrong
 * answer here costs a confusing button, not access. Request-scoped like
 * getBranding(). */
export const getFeatures = cache(async (): Promise<Record<PlanFeature, boolean>> => {
  const supabase = await createClient();
  // ponytail: get_my_features isn't in the generated types until that
  // migration is applied and the types are regenerated. Drop the cast then.
  const { data } = await supabase.rpc("get_my_features" as never);
  const flags = (data ?? {}) as Record<string, unknown>;
  return {
    forms_builder: flags.forms_builder === true,
    custom_library: flags.custom_library === true,
    white_label: flags.white_label === true,
  };
});
