"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { CoachlyLockup } from "@/components/brand/coachly-lockup";
import { BrandLogo } from "@/components/brand/coach-brand";
import { UnreadMessagesBadge } from "@/components/messages/unread-messages-badge";
import { NAV_ITEMS, type NavItem } from "./nav-items";

export function Sidebar({
  items = NAV_ITEMS,
  brandLogo,
  darkGround = true,
}: {
  items?: NavItem[];
  /** Studio coaches' own logo (see lib/branding.ts); null keeps the lockup. */
  brandLogo?: { src: string; name: string } | null;
  /** False when a Studio coach picked a light sidebar color. */
  darkGround?: boolean;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-dvh">
      <div className="px-5 py-5">
        {/* Sidebar ground is the same in both app themes (stock navy, or a
            Studio coach's own color), so the lockup asset is forced. */}
        {brandLogo ? (
          <BrandLogo {...brandLogo} />
        ) : (
          <CoachlyLockup height={26} onDarkGround={darkGround} onLightGround={!darkGround} />
        )}
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-w-0 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
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
              <span className="truncate">{t(item.labelKey)}</span>
              {item.badge === "unreadMessages" && <UnreadMessagesBadge className="ms-auto" />}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
