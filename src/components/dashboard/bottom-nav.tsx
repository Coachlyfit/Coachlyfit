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
import { BOTTOM_NAV_PRIMARY, BOTTOM_NAV_OVERFLOW } from "./nav-items";

// Bottom tab bar for <768px. Capped at 5 items total (bottom-nav-limit):
// 4 primary destinations + one "more" sheet for the rest, never a 6th icon
// crammed in.
export function BottomNav({ locale }: { locale: string }) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      {BOTTOM_NAV_PRIMARY.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            {t(item.labelKey)}
          </Link>
        );
      })}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <button
              type="button"
              className="flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium text-muted-foreground"
            />
          }
        >
          <MoreHorizontal className="size-5" aria-hidden="true" />
          {tCommon("more")}
        </SheetTrigger>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>{tCommon("more")}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-4 pb-4">
            {BOTTOM_NAV_OVERFLOW.map((item) => {
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
