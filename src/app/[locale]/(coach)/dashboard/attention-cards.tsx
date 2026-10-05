import { getTranslations } from "next-intl/server";
import { ArrowLeft, ArrowRight, ClipboardCheck, ClipboardList, FileText, Receipt, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import { getAttentionCounts } from "./data";

const CHIP: Record<StatusTone, string> = {
  success: "bg-success-tint text-success-tint-foreground",
  warning: "bg-warning-tint text-warning-tint-foreground",
  destructive: "bg-destructive-tint text-destructive-tint-foreground",
  accent: "bg-accent-tint text-accent-tint-foreground",
};

type CardKey = "review" | "invoices" | "programs";

export async function AttentionCards({ locale }: { locale: AppLocale }) {
  const t = await getTranslations("dashboard");
  const counts = await getAttentionCounts();
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;

  const cards: { key: CardKey; count: number; href: string; icon: LucideIcon; tone: StatusTone }[] = [
    { key: "review", count: counts.awaitingReview, href: "/forms/submissions", icon: FileText, tone: "accent" },
    { key: "invoices", count: counts.overdueInvoices, href: "/invoices?status=issued", icon: Receipt, tone: "destructive" },
    { key: "programs", count: counts.programsEnding, href: "/programs", icon: ClipboardList, tone: "warning" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map(({ key, count, href, icon: Icon, tone }) => {
          // Nothing waiting is a result, not a missing card: it keeps its
          // place and says so, instead of the row reflowing day to day.
          const clear = count === 0;
          return (
            <Link
              key={key}
              href={href}
              className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Card className="h-full gap-3 p-5 transition-colors hover:bg-muted/40">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "flex size-10 items-center justify-center rounded-[10px]",
                      clear ? "bg-muted text-muted-foreground" : CHIP[tone]
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <StatusBadge tone={clear ? "success" : tone}>
                    {clear ? t("attention.clear") : t(`attention.${key}.badge`)}
                  </StatusBadge>
                </div>
                <span className="font-mono text-2xl leading-8 font-semibold tabular-nums">
                  {formatNumber(count, locale)}
                </span>
                <span className="font-medium">{t(`attention.${key}.label`)}</span>
                <span className="flex items-center gap-1 font-medium text-primary">
                  {t(`attention.${key}.cta`)}
                  <Arrow className="size-4" aria-hidden="true" />
                </span>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Weekly check-ins have their own review console, which has no nav
          entry -- this is how a coach gets to it from home. */}
      {counts.pendingCheckins > 0 && (
        <Link
          href="/review"
          className="flex items-center gap-3 rounded-lg border border-warning-tint-foreground/30 bg-warning-tint px-4 py-3 text-warning-tint-foreground hover:bg-warning-tint/80"
        >
          <ClipboardCheck className="size-5 shrink-0" aria-hidden="true" />
          <p className="flex-1 text-sm font-medium">{t("pendingReview", { count: counts.pendingCheckins })}</p>
          <Arrow className="size-4 shrink-0" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

export async function TaskSummary({ locale }: { locale: AppLocale }) {
  const t = await getTranslations("dashboard.header");
  const counts = await getAttentionCounts();
  const total = counts.awaitingReview + counts.overdueInvoices + counts.programsEnding + counts.pendingCheckins;

  return (
    <p className="text-base text-muted-foreground">
      {total === 0
        ? t("allClear")
        : t.rich("tasks", {
            count: total,
            num: () => (
              <span className="font-mono font-semibold text-foreground tabular-nums">{formatNumber(total, locale)}</span>
            ),
          })}
    </p>
  );
}
