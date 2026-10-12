import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PlatformSettingsService } from "@/domain/platform/settings.service";
import { isAuditAction } from "@/domain/platform/audit";
import type { AppLocale } from "@/domain/locale";
import { GeneralTab } from "./general-tab";
import { PlatformTab } from "./platform-tab";
import { PlansTab } from "./plans-tab";
import { UsersTab } from "./users-tab";
import { AuditTab } from "./audit-tab";
import { SettingsTabs } from "./settings-tabs";
import { AUDIT_PAGE_SIZE, SETTINGS_TABS, type SettingsTab } from "./schemas";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Admin settings. The layout's role redirect is the UX guard; RLS
 * (private.is_admin()) and the admin_* RPCs are the authorization boundary. */
export default async function AdminSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ tab?: string; action?: string; admin?: string; page?: string }>;
}) {
  const { locale } = await params;
  const raw = await searchParams;
  const t = await getTranslations("admin.settings");
  const supabase = await createClient();

  // Unknown values from a hand-edited URL fall back to the defaults.
  const tab: SettingsTab = SETTINGS_TABS.includes(raw.tab as SettingsTab) ? (raw.tab as SettingsTab) : "general";
  const auditAction = isAuditAction(raw.action) ? raw.action : null;
  const auditAdmin = raw.admin && UUID.test(raw.admin) ? raw.admin : null;
  const auditPage = Math.max(1, Math.floor(Number(raw.page)) || 1);

  let auditQuery = supabase
    .from("admin_audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((auditPage - 1) * AUDIT_PAGE_SIZE, auditPage * AUDIT_PAGE_SIZE - 1);
  if (auditAction) auditQuery = auditQuery.eq("action", auditAction);
  if (auditAdmin) auditQuery = auditQuery.eq("admin_id", auditAdmin);

  const [
    {
      data: { user },
    },
    settings,
    { data: tiers },
    { data: subscriptions },
    { data: users },
    { data: auditEntries, count: auditTotal },
  ] = await Promise.all([
    supabase.auth.getUser(),
    new PlatformSettingsService(supabase).getAll(),
    supabase.from("subscription_tiers").select("*").order("price_egp_monthly"),
    supabase.from("subscriptions").select("tier_id"),
    supabase.rpc("admin_list_users"),
    auditQuery,
  ]);

  const allUsers = users ?? [];
  const coachCounts: Record<string, number> = {};
  for (const row of subscriptions ?? []) {
    if (row.tier_id) coachCounts[row.tier_id] = (coachCounts[row.tier_id] ?? 0) + 1;
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl leading-9 font-semibold">{t("title")}</h1>
          <p className="text-base text-muted-foreground">{t("subtitle")}</p>
        </div>
        {settings.platform.maintenance_mode && (
          <span className="flex h-9 items-center gap-2 rounded-full bg-destructive-tint px-3 font-semibold text-destructive-tint-foreground">
            <span className="size-2 rounded-full bg-destructive" aria-hidden="true" />
            {t("maintenanceOn")}
          </span>
        )}
      </header>

      <SettingsTabs
        locale={locale}
        tab={tab}
        counts={{ plans: (tiers ?? []).length, users: allUsers.length }}
        panels={{
          general: <GeneralTab locale={locale} branding={settings.branding} announcement={settings.announcement} />,
          platform: (
            <PlatformTab
              locale={locale}
              platform={settings.platform}
              billing={settings.billing}
              affectedUsers={allUsers.filter((u) => u.role !== "admin").length}
            />
          ),
          plans: <PlansTab locale={locale} tiers={tiers ?? []} coachCounts={coachCounts} />,
          users: <UsersTab locale={locale} users={allUsers} currentUserId={user?.id ?? ""} />,
          audit: (
            <AuditTab
              locale={locale}
              entries={auditEntries ?? []}
              total={auditTotal ?? 0}
              page={auditPage}
              action={auditAction}
              admin={auditAdmin}
              admins={allUsers.filter((u) => u.role === "admin").map((u) => ({ id: u.id, name: u.full_name ?? u.email ?? u.id }))}
            />
          ),
        }}
      />
    </div>
  );
}
