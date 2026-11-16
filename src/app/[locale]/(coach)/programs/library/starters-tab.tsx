"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { STARTERS } from "@/domain/programs/starters";
import { useRouter } from "@/i18n/navigation";
import { createFromStarterAction } from "../actions";
import { PlanMetaBadges } from "../plan-meta-badges";

/** The built-in starter programs, one per plan type. Picking one creates an ordinary template
 * (the coach's own copy) and opens it in the editor. Moved here from the old "Start from a
 * template" dialog so there is a single place for ready-made templates. */
export function StartersTab({ locale }: { locale: AppLocale }) {
  const t = useTranslations("programs.starters");
  const tErrors = useTranslations("programs.errors");
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function pick(starterId: string) {
    setPendingId(starterId);
    startTransition(async () => {
      try {
        const result = await createFromStarterAction(locale, starterId);
        if ("error" in result) {
          toast.error(tErrors(result.error));
          return;
        }
        if (result.skipped.length > 0) toast.warning(t("skipped", { names: result.skipped.join(", ") }));
        router.push(`/programs/${result.id}`);
      } catch {
        toast.error(tErrors("unknown"));
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-muted-foreground">{t("description")}</p>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {STARTERS.map((starter) => (
          <li key={starter.id} className="flex flex-col gap-3 rounded-xl bg-card p-4.5 ring-1 ring-foreground/10">
            <h2 className="text-base leading-snug font-semibold">{pickLocale(starter, locale)}</h2>
            <PlanMetaBadges planType={starter.plan_type} goal={starter.goal} level={starter.level} />
            <span className="text-sm text-muted-foreground">{t("days", { count: starter.days.length })}</span>
            <Button type="button" size="sm" className="mt-auto self-start" disabled={pendingId != null} onClick={() => pick(starter.id)}>
              {pendingId === starter.id ? t("adding") : t("use")}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
