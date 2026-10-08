import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

export function DateSeparator({ date, locale }: { date: string; locale: AppLocale }) {
  const t = useTranslations("inbox");
  const value = new Date(date);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const label = isSameDay(value, now)
    ? t("today")
    : isSameDay(value, yesterday)
      ? t("yesterday")
      : formatDate(value, locale, { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="flex justify-center py-2" role="separator" aria-label={label}>
      <span className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
