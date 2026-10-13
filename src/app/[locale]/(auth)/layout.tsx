import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { CoachlyLockup } from "@/components/brand/coachly-lockup";
import { LaunchMark } from "@/components/brand/launch-mark";
import { PortalAuthFrame } from "@/components/auth/portal-auth-frame";
import { resolvePortalSlug } from "@/lib/tenant/resolve-portal-slug";
import { createClient } from "@/lib/supabase/server";
import { COACH_LOGOS_BUCKET } from "@/domain/billing/invoices.service";

// The whole auth group stays out of the index. It is deliberately not
// disallowed in robots.ts, so crawlers can fetch the page and see this.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const slug = await resolvePortalSlug();
  let businessName: string | null = null;
  let logoUrl: string | null = null;
  if (slug) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_portal_branding", { p_slug: slug });
    const row = data as { business_name?: string; logo_path?: string | null } | null;
    businessName = row?.business_name ?? null;
    // logo_path only comes back for coaches whose plan has custom branding.
    if (row?.logo_path) {
      logoUrl = supabase.storage.from(COACH_LOGOS_BUCKET).getPublicUrl(row.logo_path).data.publicUrl;
    }
  }

  if (businessName) {
    return (
      <PortalAuthFrame businessName={businessName} logoUrl={logoUrl} className="min-h-dvh justify-center px-4 py-12">
        {children}
      </PortalAuthFrame>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-12">
      <Link href="/" className="flex flex-col items-center gap-4">
        <LaunchMark size={88} className="text-foreground" />
        <CoachlyLockup height={34} />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
