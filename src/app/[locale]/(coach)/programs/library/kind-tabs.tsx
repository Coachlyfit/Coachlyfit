"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";

/** The library's three sections: single workouts, multi-week plans, and the built-in starter programs. */
export type LibraryTab = "workout" | "plan" | "starter";

/** Workouts | Plans | Starters. Link-based, so the choice is in the URL and survives a reload. */
export function KindTabs({ tab, counts, locale }: { tab: LibraryTab; counts: Record<LibraryTab, number>; locale: AppLocale }) {
  const t = useTranslations("programs.library.tabs");
  const current = useSearchParams();
  // only `kind` changes; each tab's filters live under their own keys, so they survive a switch
  const href = (kind: "plan" | "starter" | null) => {
    const next = new URLSearchParams(current.toString());
    if (kind) next.set("kind", kind);
    else next.delete("kind");
    const query = next.toString();
    return query ? `/programs/library?${query}` : "/programs/library";
  };
  const items: { key: LibraryTab; href: string; label: string }[] = [
    { key: "workout", href: href(null), label: t("workouts") },
    { key: "plan", href: href("plan"), label: t("plans") },
    { key: "starter", href: href("starter"), label: t("starters") },
  ];
  return (
    <nav aria-label={t("label")} className="flex gap-1 rounded-[11px] bg-muted p-1 max-sm:w-full sm:self-start">
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          aria-current={tab === it.key ? "page" : undefined}
          className={cn(
            "flex h-9.5 items-center justify-center gap-1.5 rounded-lg px-3.5 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:flex-1 max-sm:px-2",
            tab === it.key && "bg-card shadow-xs"
          )}
        >
          {it.label}
          <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatNumber(counts[it.key], locale)}</span>
        </Link>
      ))}
    </nav>
  );
}
