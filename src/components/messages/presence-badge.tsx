import { useTranslations } from "next-intl";
import { formatRelativeTime } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { cn } from "@/lib/utils";

export function PresenceBadge({
  online,
  lastSeenAt,
  locale,
}: {
  online: boolean;
  lastSeenAt: Date | null;
  locale: AppLocale;
}) {
  const t = useTranslations("inbox");

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", online ? "bg-emerald-500" : "bg-muted-foreground/40")} aria-hidden="true" />
      <span>
        {online ? t("online") : lastSeenAt ? t("lastSeen", { time: formatRelativeTime(lastSeenAt, locale) }) : t("offline")}
      </span>
    </div>
  );
}
