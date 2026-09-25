import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { roleHome } from "@/lib/auth/role-home";
import { getAuthUser, getViewerProfile } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/sign-out-action";
import { getPlatformSettings } from "@/lib/platform-settings";
import { ClientBillingService } from "@/domain/billing/client-billing.service";
import { subscriptionDisplayStatus, type ClientSubscriptionStatus } from "@/domain/billing/client-subscription";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { PresenceHeartbeat } from "@/components/dashboard/presence-heartbeat";
import { AnnouncementBanner } from "@/components/dashboard/announcement-banner";
import { ClientNav } from "./client-nav";

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const t = await getTranslations("common");

  // Cached via React.cache (see src/lib/auth/session.ts) so this and the
  // profile fetch below run once per request and share their result with
  // the page underneath, instead of both layers re-deriving them serially.
  const user = await getAuthUser();
  if (!user) redirect(`/${locale}/login`);

  // profile, the client row, and platform settings are all independent of
  // one another, so fetch them together instead of one at a time. The
  // active-subscription check below does depend on the client row, so it
  // has to wait for that one result.
  const [profile, clientRow, settings] = await Promise.all([
    getViewerProfile(),
    supabase.from("clients").select("id").eq("profile_id", user.id).maybeSingle().then((r) => r.data),
    getPlatformSettings(),
  ]);

  if (profile?.role !== "client") redirect(roleHome(locale, profile?.role));
  if (profile.suspended_at) redirect(`/${locale}/suspended`);

  // A confirmed client account with no clients.profile_id link (invite
  // never accepted — see 20260922000001_link_client_invite_on_signup.sql)
  // must not reach forms it can't submit.
  if (!clientRow) redirect(`/${locale}/not-linked`);

  const billing = new ClientBillingService(supabase);
  const subscription = await billing.getActiveSubscription(clientRow.id);
  const status = subscription
    ? subscriptionDisplayStatus({ status: subscription.status as ClientSubscriptionStatus, end_date: subscription.end_date }, new Date())
    : "expired";
  if (status !== "active") redirect(`/${locale}/expired`);

  if (settings.platform.maintenance_mode) redirect(`/${locale}/maintenance`);

  return (
    <div className="flex min-h-dvh flex-col">
      <PresenceHeartbeat />
      {settings.announcement.enabled && (
        <AnnouncementBanner
          locale={locale as "ar" | "en"}
          text_ar={settings.announcement.text_ar}
          text_en={settings.announcement.text_en}
        />
      )}
      <header className="mx-auto flex w-full max-w-lg items-center justify-end gap-2 border-b border-border px-4 py-3">
        <LocaleSwitcher />
        <ThemeToggle />
        <form action={signOutAction.bind(null, locale)}>
          <Button type="submit" variant="outline" size="icon-sm" aria-label={t("signOut")}>
            <LogOut className="size-4" />
          </Button>
        </form>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 p-4 pb-20">{children}</main>
      <ClientNav />
    </div>
  );
}
