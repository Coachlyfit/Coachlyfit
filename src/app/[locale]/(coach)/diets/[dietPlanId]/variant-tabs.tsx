"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { SiblingVariant } from "@/domain/nutrition/diet-plans.service";
import { Link, useRouter } from "@/i18n/navigation";
import { duplicateDietPlanAction } from "../actions";

/** Program-owned plans only: every nutrition variant of the program as a
 * tab, with its kcal target and the days that use it, so a coach moves
 * between Training day and Rest day without a trip back to the program.
 * A variant no day links to is flagged — the client will never see it. */
export function VariantTabs({
  locale,
  currentId,
  programId,
  variants,
}: {
  locale: AppLocale;
  currentId: string;
  programId: string;
  variants: SiblingVariant[];
}) {
  const t = useTranslations("diets.variants");
  const tDay = useTranslations("programs.builder");
  const tErrors = useTranslations("diets.errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function duplicate() {
    startTransition(async () => {
      const result = await duplicateDietPlanAction(locale, currentId);
      if ("error" in result) {
        toast.error(tErrors(result.error));
        return;
      }
      router.push(`/diets/${result.id}`);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{t("label")}</p>
        <Link href={`/programs/${programId}`} className="text-xs font-medium text-primary hover:underline">
          {t("assignDays")}
        </Link>
      </div>
      <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {variants.map((v) => {
          const active = v.id === currentId;
          const days = v.days
            .map((d) => (d.label_ar || d.label_en ? pickLocale(d, locale, "label") : tDay("dayN", { n: d.day_index })))
            .join(t("separator"));
          return (
            <Link
              key={v.id}
              href={`/diets/${v.id}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex w-44 shrink-0 flex-col gap-0.5 rounded-lg border px-3 py-2 text-start transition-colors",
                active ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
              )}
            >
              <span className="truncate text-sm font-medium">{pickLocale(v, locale)}</span>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {v.target_kcal != null ? t("kcal", { n: v.target_kcal }) : t("noTarget")}
              </span>
              <span className={cn("truncate text-xs", days ? "text-muted-foreground" : "text-warning-tint-foreground")}>
                {days ? t("usedOn", { days }) : t("unused")}
              </span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={duplicate}
          disabled={pending}
          className="flex w-36 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
          {t("duplicate")}
        </button>
      </nav>
    </div>
  );
}
