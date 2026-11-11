"use client";

import { useTranslations } from "next-intl";
import { ChevronsUpDown } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { CoachlyMark } from "@/components/brand/coachly-mark";
import { UserAvatar } from "@/components/shared/user-avatar";
import { UnreadMessagesBadge, UnreadMessagesDot } from "@/components/messages/unread-messages-badge";
import { SupportUnreadBadge, SupportUnreadDot } from "@/components/support/support-unread-badge";
import {
  COACH_NAV_GROUPS,
  NAV_ITEMS,
  visibleNavItems,
  type NavFeatures,
  type NavGroup,
  type NavItem,
} from "./nav-items";
import { useSidebarCollapsed, type ShellRole } from "./sidebar-store";
import { UserMenu } from "./user-menu";

export const SIDEBAR_ID = "app-sidebar";

type CoachChrome = {
  /** The coach's business name (Studio branding); null falls back to the app name. */
  brandName: string | null;
  /** Studio coaches' own logo (see lib/branding.ts); null keeps the mark. */
  brandLogoUrl: string | null;
  /** Coach picked sidebar colors: use the --sidebar tokens, not the light card. */
  themed: boolean;
  locale: string;
  fullName: string | null;
  avatarUrl: string | null;
  userId: string;
};

/** One sidebar, two states (expanded / 88px rail), two skins:
 *  - coach: light card surface, brand tile on top, user card at the bottom;
 *  - admin: navy `sidebar` surface shared with the top bar, no header/footer.
 * The state lives in a cookie (see sidebar-store.ts) so SSR renders it. */
export function Sidebar({
  variant = "coach",
  items = NAV_ITEMS,
  groups = COACH_NAV_GROUPS,
  features,
  isOwner,
  defaultCollapsed,
  coach,
}: {
  variant?: ShellRole;
  items?: NavItem[];
  groups?: NavGroup[];
  /** The tenant's plan flags; items gated on a missing one are left out. */
  features?: NavFeatures;
  /** False for a team member, who doesn't get the owner-only items. */
  isOwner?: boolean;
  /** From the layout's cookie read; used until the user toggles. */
  defaultCollapsed: boolean;
  /** Header + footer content; coach variant only. */
  coach?: CoachChrome;
}) {
  const t = useTranslations("nav");
  const tShell = useTranslations("nav.shell");
  const tCommon = useTranslations("common");
  const pathname = usePathname();
  const [collapsed] = useSidebarCollapsed(variant, defaultCollapsed);
  const admin = variant === "admin";
  // Admin always wears the navy tokens; the coach only once they've set them.
  const dark = admin || Boolean(coach?.themed);

  const visible = visibleNavItems(items, features, isOwner);
  const byHref = new Map(visible.map((item) => [item.href, item]));
  const sections = groups
    .map((group) => ({
      labelKey: group.labelKey,
      items: group.hrefs.flatMap((href) => byHref.get(href) ?? []),
    }))
    .filter((section) => section.items.length > 0);

  // Longest matching href wins, so /admin (the home item) isn't also active on
  // /admin/requests.
  const activeHref = visible
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <aside
      id={SIDEBAR_ID}
      className={cn(
        "hidden shrink-0 flex-col overflow-hidden transition-[width] duration-200 motion-reduce:transition-none lg:flex",
        collapsed ? "w-22" : admin ? "w-62" : "w-66",
        dark
          ? "bg-sidebar text-sidebar-foreground [--scroll-thumb:color-mix(in_oklab,var(--sidebar-foreground)_35%,transparent)]"
          : "border-e border-border bg-card text-foreground",
        admin ? "lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)]" : "lg:sticky lg:top-0 lg:h-dvh"
      )}
    >
      {coach && (
        <div className={cn("flex h-16 shrink-0 items-center gap-3 px-4", collapsed && "justify-center px-0")}>
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
              coach.brandLogoUrl ? "bg-white ring-1 ring-black/5" : "bg-primary text-primary-foreground"
            )}
          >
            {coach.brandLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- public storage URL, arbitrary aspect ratio
              <img src={coach.brandLogoUrl} alt="" className="size-7 object-contain" />
            ) : (
              <CoachlyMark size={20} aria-hidden="true" />
            )}
          </span>
          {!collapsed && (
            <span className="truncate text-[15px] font-semibold">{coach.brandName ?? tCommon("appName")}</span>
          )}
        </div>
      )}

      <nav
        className={cn(
          "flex flex-1 flex-col overflow-y-auto px-3 pb-3",
          collapsed ? "gap-1 pt-3" : "gap-0.5",
          !coach && !collapsed && "pt-3"
        )}
      >
        {sections.map((section, index) => (
          <div
            key={section.labelKey ?? index}
            className={cn("flex flex-col", collapsed ? "gap-1" : "gap-0.5", !collapsed && index > 0 && "mt-3")}
          >
            {!collapsed && section.labelKey && (
              <span
                className={cn(
                  "px-3 pb-1 text-xs font-medium",
                  dark ? "text-sidebar-foreground/60" : "text-muted-foreground"
                )}
              >
                {tShell(section.labelKey)}
              </span>
            )}
            {section.items.map((item) => {
              const active = item.href === activeHref;
              const Icon = item.icon;
              const label = t(item.labelKey);
              const railLabel = item.shortLabelKey ? tShell(item.shortLabelKey) : label;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? label : undefined}
                  className={cn(
                    "relative flex min-w-0 items-center font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    collapsed
                      ? "h-13.5 flex-col justify-center gap-1 rounded-xl text-[11px] leading-none"
                      : "h-11 gap-3 rounded-[10px] px-3 text-sm",
                    dark
                      ? active
                        ? admin
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "bg-sidebar-accent text-sidebar-accent-foreground"
                        : cn("hover:bg-sidebar-accent", admin ? "text-sidebar-foreground" : "text-sidebar-foreground/70")
                      : active
                        ? "bg-accent-tint text-accent-tint-foreground"
                        : "text-foreground/80 hover:bg-muted"
                  )}
                >
                  <span className="relative shrink-0">
                    <Icon className={collapsed ? "size-5" : "size-4.5"} aria-hidden="true" />
                    {collapsed && item.badge === "unreadMessages" && (
                      <UnreadMessagesDot className="absolute -end-1.5 -top-0.5" />
                    )}
                    {collapsed && item.badge === "supportUnread" && (
                      <SupportUnreadDot className="absolute -end-1.5 -top-0.5" />
                    )}
                  </span>
                  <span className={cn("truncate", collapsed && "max-w-full px-1")}>
                    {collapsed ? railLabel : label}
                  </span>
                  {!collapsed && item.badge === "unreadMessages" && <UnreadMessagesBadge className="ms-auto" />}
                  {!collapsed && item.badge === "supportUnread" && <SupportUnreadBadge className="ms-auto" />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {coach && (
        <div className="shrink-0 p-3">
          <UserMenu
            locale={coach.locale}
            fullName={coach.fullName}
            side="top"
            contentClassName="min-w-48"
            trigger={
              <button
                type="button"
                aria-label={coach.fullName ?? tCommon("appName")}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl text-start ring-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  dark ? "ring-sidebar-border hover:bg-sidebar-accent" : "ring-border hover:bg-muted",
                  collapsed ? "justify-center p-1.5" : "p-2"
                )}
              />
            }
          >
            <UserAvatar src={coach.avatarUrl} name={coach.fullName ?? ""} userId={coach.userId} />
            {!collapsed && (
              <>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">{coach.fullName}</span>
                  <span className={cn("truncate text-xs", dark ? "text-sidebar-foreground/70" : "text-muted-foreground")}>
                    {tShell("roleCoach")}
                  </span>
                </span>
                <ChevronsUpDown
                  className={cn("size-4 shrink-0", dark ? "text-sidebar-foreground/70" : "text-muted-foreground")}
                  aria-hidden="true"
                />
              </>
            )}
          </UserMenu>
        </div>
      )}
    </aside>
  );
}
