"use client";

import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { asPlanGoal, asPlanLevel } from "@/domain/programs/plan-meta";
import type { LibraryRow } from "@/domain/programs/platform/library-view";
import { useEquipmentLabel } from "../../library/equipment-filter";
import { ResetCopyButton } from "./copy-actions";

const MAX_CHIPS = 3;

export function TemplateCard({ locale, row }: { locale: AppLocale; row: LibraryRow }) {
  const t = useTranslations("programs.library");
  const tLevels = useTranslations("programs.levels");
  const tGoals = useTranslations("programs.goals");
  const equipmentLabel = useEquipmentLabel();

  const name = pickLocale(row, locale, "name");
  const description = pickLocale(row, locale, "description");
  const level = asPlanLevel(row.level);
  const goal = asPlanGoal(row.goal);
  const chips = [
    ...row.categories.map((c) => t(`categories.${c}`)),
    ...row.equipment.map((e) => equipmentLabel(e)).filter((e): e is string => !!e),
  ];

  return (
    <article className="flex flex-col gap-3 rounded-xl bg-card p-4.5 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 text-base leading-snug font-semibold">{name}</h2>
        {row.copyId && (
          <StatusBadge tone="accent" className="shrink-0">
            {t("card.customized")}
          </StatusBadge>
        )}
      </div>

      {description && <p className="line-clamp-2 text-muted-foreground">{description}</p>}

      <div className="flex flex-wrap gap-1.5">
        {level && <Badge variant="outline">{tLevels(level)}</Badge>}
        {goal && <Badge variant="outline">{tGoals(goal)}</Badge>}
        {chips.slice(0, MAX_CHIPS).map((c) => (
          <span key={c} className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
            {c}
          </span>
        ))}
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
          {t("card.exercises", { count: row.exercises })}
        </span>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <Link
          href={`/programs/library/${row.id}`}
          className={cn(buttonVariants({ size: "sm", variant: row.copyId ? "outline" : "default" }))}
        >
          {t("card.preview")}
        </Link>
        {row.copyId && (
          <>
            <Link href={`/programs/${row.copyId}`} className={buttonVariants({ size: "sm" })}>
              {t("card.openCopy")}
            </Link>
            <ResetCopyButton locale={locale} templateId={row.id} copyId={row.copyId} />
          </>
        )}
      </div>
    </article>
  );
}
