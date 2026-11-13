import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { SkillLadder } from "@/domain/progress/skill-levels";
import { cn } from "@/lib/utils";

/** Calisthenics skill progress: per ladder (planche, front lever, ...) the rungs
 * the athlete has reached and what comes next. Renders nothing when they have
 * not logged a rung of any ladder, so it never clutters a strength athlete's page. */
export function SkillLadders({ ladders, locale }: { ladders: SkillLadder[]; locale: AppLocale }) {
  const t = useTranslations("progress.skills");
  if (ladders.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
      <ul className="flex flex-col gap-3">
        {ladders.map((ladder) => (
          <li key={ladder.group} className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">{t(`groups.${ladder.group}`)}</span>
              <span className="font-mono text-sm text-muted-foreground tabular-nums">
                {t("level", { level: ladder.reachedLevel, total: ladder.rungs.length })}
              </span>
            </div>
            <ol className="flex flex-wrap gap-1.5">
              {ladder.rungs.map((rung) => (
                <li
                  key={rung.id}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                    rung.reached
                      ? "bg-success-tint font-medium text-success-tint-foreground"
                      : "border border-border text-muted-foreground"
                  )}
                >
                  {rung.reached && <Check className="size-3" strokeWidth={3} aria-hidden="true" />}
                  {pickLocale(rung, locale)}
                </li>
              ))}
            </ol>
            <p className="text-sm text-muted-foreground">
              {ladder.next ? t("next", { name: pickLocale(ladder.next, locale) }) : t("top")}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
