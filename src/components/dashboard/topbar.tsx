"use client";

import { useTranslations } from "next-intl";
import { LogOut, User } from "lucide-react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
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
import { NotificationBell } from "./notification-bell";
import { usePageTitleStore } from "./page-title-store";

export function Topbar({ locale, fullName }: { locale: string; fullName: string | null }) {
  const tCommon = useTranslations("common");
  const title = usePageTitleStore((s) => s.title);
  const subtitle = usePageTitleStore((s) => s.subtitle);

  return (
    <header className="flex items-center gap-4 border-b border-border px-4 py-3 md:px-6">
      {title && (
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="truncate text-base font-semibold">{title}</span>
          {subtitle && <span className="hidden truncate text-sm text-muted-foreground sm:inline">{subtitle}</span>}
        </div>
      )}
      <span className="hidden text-sm font-medium text-muted-foreground md:ms-auto md:block">
        {fullName}
      </span>
      <div className="flex items-center gap-2 ms-auto md:ms-0">
        <NotificationBell locale={locale as AppLocale} />
        <LocaleSwitcher />
        <ThemeToggle />
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
