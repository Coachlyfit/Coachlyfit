"use client";

import { Home, CalendarDays, LineChart, MessageCircle, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/c", key: "home", icon: Home },
  { href: "/c/plan", key: "plan", icon: CalendarDays },
  { href: "/c/progress", key: "progress", icon: LineChart },
  { href: "/c/coach", key: "coach", icon: MessageCircle },
  { href: "/c/forms", key: "forms", icon: FileText },
] as const;

export function ClientNav() {
  const t = useTranslations("nav");
  const tClient = useTranslations("client");
  const pathname = usePathname();

  function labelFor(key: (typeof ITEMS)[number]["key"]) {
    if (key === "home") return tClient("home");
    if (key === "forms") return t("forms");
    if (key === "plan") return t("plan");
    if (key === "coach") return t("coach");
    return t("progress");
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-lg border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
      {ITEMS.map((item) => {
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
            {labelFor(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
