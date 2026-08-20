"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { CoachlyLockup } from "@/components/brand/coachly-lockup";
import { NAV_ITEMS, type NavItem } from "./nav-items";

export function Sidebar({ items = NAV_ITEMS }: { items?: NavItem[] }) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="px-5 py-5">
        {/* Sidebar ground is always dark (#0F172A light mode / #020617 dark
            mode) regardless of app theme, so the lockup asset is forced. */}
        <CoachlyLockup height={26} onDarkGround />
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
            >
              {/* Active rail: a thin accent bar at the inline-start edge,
                  matching the design's nav treatment (accent rail + subtle
                  fill, not a solid brand-color block). */}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-y-2 start-0 w-0.5 rounded-full bg-sidebar-ring transition-opacity",
                  active ? "opacity-100" : "opacity-0"
                )}
              />
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
