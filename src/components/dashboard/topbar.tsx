"use client";

import { useTranslations } from "next-intl";
import { PanelLeft } from "lucide-react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { InstallAppButton } from "@/components/install-app-button";
import { CoachlyMark } from "@/components/brand/coachly-mark";
import { CoachlyLockup } from "@/components/brand/coachly-lockup";
import { BrandLogo } from "@/components/brand/coach-brand";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import { CommandPalette } from "./command-palette";
import { NotificationBell } from "./notification-bell";
import { usePageTitleStore } from "./page-title-store";
import { SIDEBAR_ID } from "./sidebar";
import { useSidebarCollapsed, type ShellRole } from "./sidebar-store";
import { UserMenu } from "./user-menu";
import type { NavFeatures, NavItem } from "./nav-items";

// The shared ghost button turns light-grey on hover, which is unreadable on
// the navy admin bar; re-tint it from the sidebar tokens.
const ADMIN_GHOST =
  "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground dark:hover:bg-sidebar-accent dark:aria-expanded:bg-sidebar-accent";

export function Topbar({
  variant = "coach",
  defaultCollapsed,
  locale,
  fullName,
  avatarUrl = null,
  userId = "",
  navItems,
  navFeatures,
  isOwner,
  brandLogo,
}: {
  /** coach: transparent bar on the page. admin: navy bar sharing the sidebar's
   *  surface (the L shape; see the (admin) layout). */
  variant?: ShellRole;
  /** From the layout's cookie read; used until the user toggles. */
  defaultCollapsed: boolean;
  locale: string;
  fullName: string | null;
  /** Public avatar URL, or null. */
  avatarUrl?: string | null;
  /** Used to pick a stable fallback tint for the initials. */
  userId?: string;
  /** Studio coaches' own logo (see lib/branding.ts); null keeps the mark. */
  brandLogo?: { src: string; name: string } | null;
  /** Forwarded to CommandPalette; defaults to the coach NAV_ITEMS there.
   *  (admin)/layout.tsx passes ADMIN_NAV_ITEMS since Topbar is shared by
   *  both role layouts. */
  navItems?: NavItem[];
  /** The tenant's plan flags, forwarded to CommandPalette with navItems. */
  navFeatures?: NavFeatures;
  /** False for a team member; forwarded to CommandPalette the same way. */
  isOwner?: boolean;
}) {
  const tCommon = useTranslations("common");
  const tShell = useTranslations("nav.shell");
  const title = usePageTitleStore((s) => s.title);
  const subtitle = usePageTitleStore((s) => s.subtitle);
  const [collapsed, toggle] = useSidebarCollapsed(variant, defaultCollapsed);
  const admin = variant === "admin";
  const ghost = admin ? ADMIN_GHOST : undefined;

  return (
    <header
      className={cn(
        "flex items-center gap-2 sm:gap-4",
        admin
          ? "sticky top-0 z-30 h-14 bg-sidebar pe-4 text-sidebar-foreground"
          : "h-16 border-b border-border ps-4 pe-4 md:ps-6 md:pe-6"
      )}
    >
      {admin ? (
        <div
          className={cn(
            "flex h-full shrink-0 items-center ps-4 transition-[width] duration-200 motion-reduce:transition-none lg:ps-0",
            collapsed ? "lg:w-22 lg:justify-center" : "lg:w-62 lg:ps-5"
          )}
        >
          {/* The bar is navy in both themes, so the dark-ground assets are
              forced. Below lg there is no sidebar, so always the mark. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img
            src="/brand/mark-dark.svg"
            alt="coachlyfit"
            width={28}
            height={28}
            className={cn(!collapsed && "lg:hidden")}
          />
          {!collapsed && (
            <span className="hidden lg:block">
              <CoachlyLockup height={26} onDarkGround />
            </span>
          )}
        </div>
      ) : brandLogo ? (
        <BrandLogo {...brandLogo} className="lg:hidden" />
      ) : (
        <CoachlyMark size={24} className="shrink-0 text-foreground lg:hidden" />
      )}

      <Button
        type="button"
        variant="ghost"
        aria-label={collapsed ? tShell("expand") : tShell("collapse")}
        aria-expanded={!collapsed}
        aria-controls={SIDEBAR_ID}
        onClick={toggle}
        className={cn("hidden size-11 lg:inline-flex", ghost)}
      >
        <PanelLeft className="size-5 rtl:-scale-x-100" aria-hidden="true" />
      </Button>

      {title && (
        <div className="flex min-w-0 items-baseline gap-3">
          <span className={cn("truncate font-semibold", admin ? "text-lg text-sidebar-accent-foreground" : "text-xl")}>
            {title}
          </span>
          {subtitle && (
            <span
              className={cn(
                "hidden truncate text-sm sm:inline",
                admin ? "text-sidebar-foreground/70" : "text-muted-foreground"
              )}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}

      {/* One CommandPalette instance (it owns the global ⌘K listener): an icon
          button next to the actions below lg, the centred search box above. */}
      <div className="ms-auto flex lg:ms-0 lg:flex-1 lg:justify-center">
        <CommandPalette items={navItems} features={navFeatures} isOwner={isOwner} onSidebar={admin} />
      </div>

      <div
        className={cn(
          "flex items-center gap-1 sm:gap-2",
          !admin && "sm:gap-0.5 sm:rounded-xl sm:border sm:border-border sm:bg-card sm:p-0.5"
        )}
      >
        <NotificationBell locale={locale as AppLocale} variant="ghost" className={ghost} />
        <InstallAppButton variant="ghost" className={ghost} />
        <LocaleSwitcher variant="ghost" className={cn("hidden sm:inline-flex", ghost)} />
        <ThemeToggle variant="ghost" className={cn("hidden sm:inline-flex", ghost)} />
        {/* Coach: the sidebar's user card owns the menu from lg up; below lg
            (no sidebar) this keeps sign-out reachable. Admin: always here. */}
        <UserMenu
          locale={locale}
          fullName={fullName}
          trigger={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={fullName ?? tCommon("appName")}
              className={cn("rounded-full", admin ? ADMIN_GHOST : "lg:hidden")}
            />
          }
        >
          <UserAvatar src={avatarUrl} name={fullName ?? ""} userId={userId} size="sm" />
        </UserMenu>
      </div>
    </header>
  );
}
