import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { COACH_LOGOS_BUCKET } from "@/domain/billing/invoices.service";
import { brandCss } from "@/lib/brand-theme";

export type Branding = {
  /** Ready-to-inline CSS overrides; "" when only a logo is set. */
  css: string;
  logoUrl: string | null;
  businessName: string;
};

type BrandingRow = { primary: string | null; accent: string | null; logo_path: string | null; business_name: string };

/** The viewer's effective coach branding (their own tenant, or their coach's
 * when the viewer is a client), or null when the coach's plan doesn't include
 * custom branding. get_my_branding() does both the tenant resolution and the
 * plan check in SQL; see 20261011000001_coach_branding.sql. Request-scoped
 * like the helpers in lib/auth/session.ts. */
export const getBranding = cache(async (): Promise<Branding | null> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_my_branding");
  const row = data as BrandingRow | null;
  if (!row) return null;
  return {
    css: brandCss({ primary: row.primary, accent: row.accent }),
    logoUrl: row.logo_path
      ? supabase.storage.from(COACH_LOGOS_BUCKET).getPublicUrl(row.logo_path).data.publicUrl
      : null,
    businessName: row.business_name,
  };
});
