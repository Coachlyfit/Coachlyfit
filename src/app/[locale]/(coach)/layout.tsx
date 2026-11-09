import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { roleHome } from "@/lib/auth/role-home";
import { getAuthUser, getViewerProfile, getRequestCoachId } from "@/lib/auth/session";
import { getPlatformSettings } from "@/lib/platform-settings";
import { getBranding } from "@/lib/branding";
import { getFeatures } from "@/lib/features";
import { coachAccess } from "@/domain/billing/access";
import { BrandStyle } from "@/components/brand/coach-brand";
import { AVATARS_BUCKET } from "@/domain/avatars/avatar.service";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { ImpersonationBanner } from "@/components/dashboard/impersonation-banner";
import { AnnouncementBanner } from "@/components/dashboard/announcement-banner";
import { SubscriptionBanner } from "@/components/dashboard/subscription-banner";
import { FeedbackWidget } from "@/components/dashboard/feedback-widget";
import { PresenceHeartbeat } from "@/components/dashboard/presence-heartbeat";
import { InboxRealtime } from "@/components/messages/unread-messages-badge";

export default async function CoachLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();

  // getUser() (not getSession()) — revalidates the JWT against the Auth
  // server rather than trusting a locally-decoded cookie. Cached via
  // React.cache (see src/lib/auth/session.ts) so this and the queries below
  // run once per request and share results with the page underneath,
  // instead of every layer re-deriving the same answers serially.
  const user = await getAuthUser();
  if (!user) redirect(`/${locale}/login`);

  // profile / platform settings / tenant coachId are independent of one
  // another -- none needs another's result -- so fetch them together
  // instead of one at a time.
  const [profile, settings, coachId, branding, features, { data: subscription }] = await Promise.all([
    getViewerProfile(),
    getPlatformSettings(),
    getRequestCoachId(),
    getBranding(),
    getFeatures(),
    // No coach_id filter: the coach_read policy scopes this to the caller's
    // tenant, which for a team member is the owner's subscription.
    supabase.from("subscriptions").select("status, trial_ends_at").maybeSingle(),
  ]);

  if (profile?.role !== "coach") redirect(roleHome(locale, profile?.role));
  if (profile.suspended_at) redirect(`/${locale}/suspended`);
  if (settings.platform.maintenance_mode) redirect(`/${locale}/maintenance`);

  if (coachId === user.id) {
    // The tenant owner -- unchanged existing gate.
    const { data: coach } = await supabase
      .from("coaches")
      .select("onboarding_completed_at")
      .eq("id", user.id)
      .single();
    if (!coach?.onboarding_completed_at) redirect(`/${locale}/onboarding`);
  }
  // Else: an accepted team member (coachId is someone else's tenant id, or
  // null). Team members never go through onboarding, so the gate simply
  // doesn't apply to them. If coachId is null here despite role === "coach"
  // that's a broken/incomplete signup state; let them through to the
  // dashboard rather than trap them in a redirect loop -- the dashboard's
  // own queries will just come back empty, which is a saner failure mode
  // than an infinite bounce.

  // Display-only: this cookie drives nothing but whether the banner
  // renders. The actual authorization boundary is begin_impersonation()
  // (admin-checked, writes impersonation_log atomically with that check —
  // see admin/actions.ts's impersonateCoachAction) plus the magic-link
  // session it mints; the session that lands here has already gone through
  // that RPC by the time this cookie is read. Forging this cookie value
  // shows/hides a banner, nothing more.
  const impersonating = (await cookies()).get("impersonating")?.value === "1";

  // Lapsed subscription (canceled, or no row): everything but the
  // subscription page redirects there, so the coach can ask to reactivate.
  // UX only -- a layout doesn't re-run on client-side navigation, and the
  // impersonating cookie that lets an admin through is forgeable. The
  // boundary is in the database (20261017000002_coach_access_guard.sql),
  // which blocks a lapsed coach's writes whatever this does. A null coachId
  // (see above) has no tenant to check and is let through as before.
  const access = coachAccess(subscription, new Date());
  const locked = coachId !== null && !access.allowed && !impersonating;
  if (locked) {
    const pathname = (await headers()).get("x-pathname") ?? "";
    // Support stays reachable: a billing problem is exactly when a locked
    // coach needs to write to us. The subscription page links to it.
    const inSupport = pathname === `/${locale}/support` || pathname.startsWith(`/${locale}/support/`);
    if (!pathname.endsWith("/settings/subscription") && !inSupport) redirect(`/${locale}/settings/subscription`);
  }

  // Owner-only nav items (support) are left out for a team member.
  const isOwner = coachId === user.id;
  const brandLogo = branding?.logoUrl ? { src: branding.logoUrl, name: branding.businessName } : null;
  const avatarUrl = profile?.avatar_url
    ? supabase.storage.from(AVATARS_BUCKET).getPublicUrl(profile.avatar_url).data.publicUrl
    : null;

  return (
    <div className="flex min-h-dvh">
      {branding && <BrandStyle css={branding.css} />}
      {/* Don't mark the real coach "online" while an admin is impersonating
       * them -- that's the admin's activity, not the coach's. */}
      {!impersonating && <PresenceHeartbeat />}
      <InboxRealtime />
      {/* Locked: no nav, the subscription page is the only place to be. */}
      {!locked && (
        <Sidebar
          features={features}
          isOwner={isOwner}
          brandLogo={brandLogo}
          darkGround={branding?.sidebarDark ?? true}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {impersonating && <ImpersonationBanner locale={locale} fullName={profile.full_name ?? ""} />}
        {settings.announcement.enabled && (
          <AnnouncementBanner
            locale={locale as "ar" | "en"}
            text_ar={settings.announcement.text_ar}
            text_en={settings.announcement.text_en}
          />
        )}
        {access.banner && <SubscriptionBanner kind={access.banner} days={access.days} />}
        <Topbar
          locale={locale}
          fullName={profile.full_name}
          avatarUrl={avatarUrl}
          userId={user.id}
          brandLogo={brandLogo}
          navFeatures={features}
          isOwner={isOwner}
        />
        <main className="min-w-0 flex-1 p-4 pb-[calc(var(--bottom-nav-h)+1rem)] lg:p-6 lg:pb-6">
          {children}
        </main>
      </div>
      {!locked && <BottomNav locale={locale} features={features} isOwner={isOwner} />}
      <FeedbackWidget />
    </div>
  );
}
