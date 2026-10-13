"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MoreHorizontal, LogOut } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/sign-out-action";
import { UnreadMessagesBadge, UnreadMessagesDot } from "@/components/messages/unread-messages-badge";
import { NAV_ITEMS, ADMIN_NAV_ITEMS, visibleNavItems, type NavFeatures } from "./nav-items";

// Bottom tab bar for <1024px (below the sidebar's lg breakpoint). Capped at 5
// items total (bottom-nav-limit): 4 primary destinations + one "more" sheet
// for the rest, never a 6th icon crammed in.
//
// Takes `admin` (a bool), not the items array itself -- same reasoning as
// admin-sidebar.tsx/admin-topbar.tsx: NAV_ITEMS/ADMIN_NAV_ITEMS carry lucide
// icon components, which aren't serializable across the Server->Client
// boundary, so the (admin) Server Component layout can't pass ADMIN_NAV_ITEMS
// down as a prop.
export function BottomNav({
  locale,
  admin = false,
  features,
}: {
  locale: string;
  admin?: boolean;
  /** The tenant's plan flags; items gated on a missing one are left out. */
  features?: NavFeatures;
}) {
  const items = visibleNavItems(admin ? ADMIN_NAV_ITEMS : NAV_ITEMS, features);
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const primary = items.slice(0, 4);
  const overflow = items.slice(4);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background pb-[env(safe-area-inset-bottom)] lg:hidden">
      {primary.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-12 min-w-0 flex-1 flex-col items-center gap-1 py-2 text-xs font-medium",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span className="max-w-full truncate px-1">{t(item.labelKey)}</span>
          </Link>
        );
      })}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <button
              type="button"
              className="flex min-h-12 min-w-0 flex-1 flex-col items-center gap-1 py-2 text-xs font-medium text-muted-foreground"
            />
          }
        >
          <span className="relative">
            <MoreHorizontal className="size-5" aria-hidden="true" />
            {/* The messages item lives behind this tab, so its unread state surfaces here. */}
            {overflow.some((item) => item.badge === "unreadMessages") && (
              <UnreadMessagesDot className="absolute -end-1.5 -top-0.5" />
            )}
          </span>
          {tCommon("more")}
        </SheetTrigger>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>{tCommon("more")}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {overflow.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {t(item.labelKey)}
                  {item.badge === "unreadMessages" && <UnreadMessagesBadge className="ms-auto" />}
                </Link>
              );
            })}
            <Button
              variant="ghost"
              className="justify-start gap-3 px-3 text-destructive hover:text-destructive"
              onClick={() => signOutAction(locale)}
            >
              <LogOut className="size-4" aria-hidden="true" />
              {tCommon("signOut")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}

