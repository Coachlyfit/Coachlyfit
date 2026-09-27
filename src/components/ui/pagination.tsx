"use client";

import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";

/** Server-side pager shared by every paginated library list. Renders nothing
 * once everything already fits on one page, so callers can mount it
 * unconditionally under a result list. */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  disabled = false,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("library.pagination");
  const locale = useLocale() as AppLocale;

  if (total <= pageSize) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
      <p className="min-w-0 text-sm text-muted-foreground" aria-live="polite">
        {t("range", {
          from: formatNumber(from, locale),
          to: formatNumber(to, locale),
          total: formatNumber(total, locale),
        })}
      </p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={t("prev")}
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-4 rtl:rotate-180" />
        </Button>
        <span className="px-2 text-sm tabular-nums text-muted-foreground">
          {formatNumber(page, locale)} / {formatNumber(totalPages, locale)}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={t("next")}
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="size-4 rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );
}
