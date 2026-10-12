import { createClient } from "@/lib/supabase/server";
import type { AppLocale } from "@/domain/locale";
import { PRICING_TIER_COLUMNS } from "@/components/marketing/pricing-section";
import { PreviewClient } from "./preview-client";

/** What the site editor shows in its iframe. An iframe rather than a div so
 * the sections respond to the frame's width the way they will to a phone's:
 * Tailwind breakpoints follow the viewport, not a container.
 *
 * The route's locale is the preview language, so direction, fonts and links
 * come from the normal next-intl path. It renders nothing on its own; the
 * editor posts it the draft. */
export default async function SitePreviewPage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  const supabase = await createClient();
  const { data: tiers } = await supabase
    .from("subscription_tiers")
    .select(PRICING_TIER_COLUMNS)
    .eq("is_active", true)
    .order("price_egp_monthly", { ascending: true });

  return <PreviewClient locale={locale} tiers={tiers ?? []} />;
}
