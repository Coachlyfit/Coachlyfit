import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CoachlyLockup } from "@/components/brand/coachly-lockup";
import { LaunchMark } from "@/components/brand/launch-mark";
import { resolvePortalSlug } from "@/lib/tenant/resolve-portal-slug";
import { createClient } from "@/lib/supabase/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("auth");
  const slug = await resolvePortalSlug();
  let businessName: string | null = null;
  if (slug) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_portal_branding", { p_slug: slug });
    businessName = (data as { business_name?: string } | null)?.business_name ?? null;
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-12">
      {businessName ? (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-xl font-semibold tracking-tight">{businessName}</p>
        </div>
      ) : (
        <Link href="/" className="flex flex-col items-center gap-4">
          <LaunchMark size={88} className="text-foreground" />
          <CoachlyLockup height={34} />
        </Link>
      )}
      <div className="w-full max-w-sm">{children}</div>
      {businessName && <p className="text-xs text-muted-foreground">{t("poweredBy")}</p>}
    </div>
  );
}
