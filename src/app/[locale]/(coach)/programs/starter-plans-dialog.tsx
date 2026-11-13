"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { STARTERS } from "@/domain/programs/starters";
import { useRouter } from "@/i18n/navigation";
import { createFromStarterAction } from "./actions";
import { PlanMetaBadges } from "./plan-meta-badges";

/** "Start from a template": one built-in starter per plan type. Picking one
 * creates an ordinary template program (the coach's own copy) and opens it. */
export function StarterPlansDialog({ locale }: { locale: AppLocale }) {
  const t = useTranslations("programs.starters");
  const tErrors = useTranslations("programs.errors");
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
        setOpen(false);
        router.push(`/programs/${result.id}`);
      } catch {
        toast.error(tErrors("unknown"));
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <LayoutTemplate className="size-4" />
        {t("button")}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-3">
          {STARTERS.map((starter) => (
            <li key={starter.id} className="flex items-center gap-3 rounded-xl border border-border p-3.5">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="truncate font-semibold">{pickLocale(starter, locale)}</span>
                <PlanMetaBadges planType={starter.plan_type} goal={starter.goal} level={starter.level} />
                <span className="text-sm text-muted-foreground">{t("days", { count: starter.days.length })}</span>
              </div>
              <Button type="button" size="sm" disabled={pendingId != null} onClick={() => pick(starter.id)}>
                {pendingId === starter.id ? t("adding") : t("use")}
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
