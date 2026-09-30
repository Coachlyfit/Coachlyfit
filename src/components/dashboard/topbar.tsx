"use client";

import { useTranslations, useLocale } from "next-intl";
import { useTheme } from "next-themes";
import { LogOut, User, Languages, SunMoon } from "lucide-react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { CoachlyMark } from "@/components/brand/coachly-mark";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/sign-out-action";
import type { AppLocale } from "@/domain/locale";
import { CommandPalette } from "./command-palette";
import { NotificationBell } from "./notification-bell";
import { usePageTitleStore } from "./page-title-store";
import type { NavItem } from "./nav-items";

export function Topbar({
  locale,
  fullName,
  navItems,
}: {
  locale: string;
  fullName: string | null;
  /** Forwarded to CommandPalette; defaults to the coach NAV_ITEMS there.
   *  (admin)/layout.tsx passes ADMIN_NAV_ITEMS since Topbar is shared by
   *  both role layouts. */
  navItems?: NavItem[];
}) {
  const tCommon = useTranslations("common");
  const title = usePageTitleStore((s) => s.title);
  const subtitle = usePageTitleStore((s) => s.subtitle);

  // Below `sm` there isn't room for 5 icon buttons next to the title, so the
  // locale/theme toggles move into the user menu; from `sm` up they stay as
  // standalone buttons (unchanged desktop behavior).
  const currentLocale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const otherLocale = routing.locales.find((l) => l !== currentLocale) ?? currentLocale;

  return (
    <header className="flex items-center gap-2 border-b border-border px-4 py-3 sm:gap-4 md:px-6">
      <CoachlyMark size={24} className="shrink-0 text-foreground lg:hidden" />
      {title && (
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="truncate text-base font-semibold">{title}</span>
          {subtitle && <span className="hidden truncate text-sm text-muted-foreground sm:inline">{subtitle}</span>}
        </div>
      )}
      <span className="hidden text-sm font-medium text-muted-foreground md:ms-auto md:block">
        {fullName}
      </span>
      <div className="flex items-center gap-1 ms-auto sm:gap-2 md:ms-0">
        <CommandPalette items={navItems} />
        <NotificationBell locale={locale as AppLocale} />
        <LocaleSwitcher className="hidden sm:inline-flex" />
        <ThemeToggle className="hidden sm:inline-flex" />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="icon-sm" aria-label={fullName ?? tCommon("appName")} />}
          >
            <User className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {fullName && (
              <DropdownMenuGroup>
                <DropdownMenuLabel>{fullName}</DropdownMenuLabel>
              </DropdownMenuGroup>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="sm:hidden"
              onClick={() => router.replace(pathname, { locale: otherLocale })}
            >
              <Languages className="size-4" />
              {tCommon("language")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="sm:hidden"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            >
              <SunMoon className="size-4" />
              {tCommon("theme")}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="sm:hidden" />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => signOutAction(locale)}
            >
              <LogOut className="size-4" />
              {tCommon("signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
