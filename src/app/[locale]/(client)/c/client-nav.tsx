"use client";

import { Home, CalendarDays, Salad, LineChart, MessageCircle, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/c", key: "home", icon: Home },
  { href: "/c/plan", key: "plan", icon: CalendarDays },
  { href: "/c/diet", key: "diet", icon: Salad },
  { href: "/c/progress", key: "progress", icon: LineChart },
  { href: "/c/coach", key: "coach", icon: MessageCircle },
  { href: "/c/forms", key: "forms", icon: FileText },
] as const;

export function ClientNav({ formsDue = 0 }: { formsDue?: number }) {
  const t = useTranslations("nav");
  const tClient = useTranslations("client");
  const tForms = useTranslations("forms.clientList");
  const pathname = usePathname();

  function labelFor(key: (typeof ITEMS)[number]["key"]) {
    if (key === "home") return tClient("home");
    if (key === "forms") return t("forms");
    if (key === "plan") return t("plan");
    if (key === "coach") return t("coach");
    if (key === "diet") return tClient("diet.title");
    return t("progress");
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-lg border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
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
            <span className="relative">
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              {item.key === "forms" && formsDue > 0 && (
                <>
                  <span
                    aria-hidden="true"
                    className="absolute -top-1.5 -end-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] leading-none text-primary-foreground"
                  >
                    {formsDue > 9 ? "9+" : formsDue}
                  </span>
                  <span className="sr-only">{tForms("pendingBadge", { count: formsDue })}</span>
                </>
              )}
            </span>
            <span className="max-w-full truncate px-0.5">{labelFor(item.key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
