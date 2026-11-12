import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { roleHome } from "@/lib/auth/role-home";
import { getAuthUser, getViewerProfile } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/sign-out-action";
import { getPlatformSettings } from "@/lib/platform-settings";
import { getBranding } from "@/lib/branding";
import { BrandLogo, BrandStyle } from "@/components/brand/coach-brand";
import { MessagesService } from "@/domain/messages/messages.service";
import { ClientBillingService } from "@/domain/billing/client-billing.service";
import { subscriptionDisplayStatus, type ClientSubscriptionStatus } from "@/domain/billing/client-subscription";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { InstallAppButton } from "@/components/install-app-button";
import { CoachlyMark } from "@/components/brand/coachly-mark";
import { Button } from "@/components/ui/button";
import { FeedbackWidget } from "@/components/feedback/feedback-widget";
import { PresenceHeartbeat } from "@/components/dashboard/presence-heartbeat";
import { AnnouncementBanner } from "@/components/dashboard/announcement-banner";
import { OfflineProvider } from "@/components/offline/offline-provider";
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
  const [profile, clientRow, settings, branding, coachName, formsDue, unreadMessages] = await Promise.all([
    getViewerProfile(),
    supabase.from("clients").select("id").eq("profile_id", user.id).maybeSingle().then((r) => r.data),
    getPlatformSettings(),
    getBranding(),
    // The active coach's name for the header. Both tables are readable by the
    // client under RLS (client_read_own, client_read_related_coach), and it
    // is the coach's name, not a branding feature, so every plan gets it.
    supabase
      .from("coaching_relationships")
      .select("coaches(business_name)")
      .eq("status", "active")
      .maybeSingle()
      .then((r) => r.data?.coaches?.business_name ?? null),
    // RLS (client_read_own) scopes this to the viewer's own assignments.
    supabase
      .from("form_assignments")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .then((r) => r.count ?? 0),
    new MessagesService(supabase).countUnreadFromCoach().catch(() => 0),
  ]);

  if (profile?.role !== "client") redirect(roleHome(locale, profile?.role));
  if (profile.suspended_at) redirect(`/${locale}/suspended`);

  // A confirmed client account with no clients.profile_id link (invite
  // never accepted — see 20260922000001_link_client_invite_on_signup.sql)
  // must not reach forms it can't submit.
  if (!clientRow) redirect(`/${locale}/not-linked`);

  // No subscription row yet (freshly invited, coach hasn't assigned a
  // package) is "none", not "expired" — only block a real lapsed/frozen/
  // canceled subscription. Mirrors subscriptionRosterStatus's "none".
  const billing = new ClientBillingService(supabase);
  const subscription = await billing.getActiveSubscription(clientRow.id);
  if (subscription) {
    const status = subscriptionDisplayStatus(
      { status: subscription.status as ClientSubscriptionStatus, end_date: subscription.end_date },
      new Date()
    );
    if (status !== "active") redirect(`/${locale}/expired`);
  }

  if (settings.platform.maintenance_mode) redirect(`/${locale}/maintenance`);

  return (
    <div className="flex min-h-dvh flex-col">
      {branding && <BrandStyle css={branding.css} />}
      <PresenceHeartbeat />
      <OfflineProvider userId={user.id} />
      {settings.announcement.enabled && (
        <AnnouncementBanner
          locale={locale as "ar" | "en"}
          text_ar={settings.announcement.text_ar}
          text_en={settings.announcement.text_en}
        />
      )}
      <header className="mx-auto flex w-full max-w-lg items-center gap-2 border-b border-border px-4 py-3">
        {branding?.logoUrl ? (
          <BrandLogo src={branding.logoUrl} name={branding.businessName} />
        ) : (
          <CoachlyMark size={24} className="text-foreground" />
        )}
        {(branding?.businessName ?? coachName) && (
          <span className="min-w-0 truncate text-sm font-semibold">{branding?.businessName ?? coachName}</span>
        )}
        <div className="ms-auto flex shrink-0 items-center gap-2">
          <InstallAppButton />
          <LocaleSwitcher />
          <ThemeToggle />
          <form action={signOutAction.bind(null, locale)}>
            <Button type="submit" variant="outline" size="icon-sm" aria-label={t("signOut")}>
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-lg flex-1 p-4 pb-[calc(var(--bottom-nav-h)+1rem)] has-[[data-wide]]:lg:max-w-5xl">
        {children}
      </main>
      <ClientNav formsDue={formsDue} unreadMessages={unreadMessages} />
      <FeedbackWidget userId={user.id} />
    </div>
  );
}
