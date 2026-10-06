import { Link } from "@/i18n/navigation";
import { CoachlyLockup } from "@/components/brand/coachly-lockup";
import { LaunchMark } from "@/components/brand/launch-mark";
import { PortalAuthFrame } from "@/components/auth/portal-auth-frame";
import { resolvePortalSlug } from "@/lib/tenant/resolve-portal-slug";
import { createClient } from "@/lib/supabase/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const slug = await resolvePortalSlug();
  let businessName: string | null = null;
  if (slug) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_portal_branding", { p_slug: slug });
    businessName = (data as { business_name?: string } | null)?.business_name ?? null;
  }

  if (businessName) {
    return (
      <PortalAuthFrame businessName={businessName} className="min-h-dvh justify-center px-4 py-12">
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
