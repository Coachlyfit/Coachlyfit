"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import type { PageVersion } from "@/domain/marketing/marketing.service";
import { listVersionsAction, restoreVersionAction } from "./actions";

export const versionsKey = (pageId: string) => ["admin", "site", pageId, "versions"] as const;

export function VersionSheet({
  pageId,
  initialVersions,
  open,
  onOpenChange,
  onRestored,
}: {
  pageId: string;
  initialVersions: PageVersion[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestored: () => void;
}) {
  const t = useTranslations("admin.site");
  const locale = useLocale() as AppLocale;
  const [target, setTarget] = useState<PageVersion | null>(null);
  const [restoring, startRestore] = useTransition();

  const { data: versions } = useQuery({
    queryKey: versionsKey(pageId),
    queryFn: async () => {
      const result = await listVersionsAction(pageId);
      if ("error" in result) throw new Error(result.error);
      return result.versions;
    },
    initialData: initialVersions,
    staleTime: Infinity,
  });

  function restore(version: PageVersion) {
    startRestore(async () => {
      const result = await restoreVersionAction(version.id);
      if (result?.error) {
        toast.error(t(`errors.${t.has(`errors.${result.error}`) ? result.error : "generic"}`));
        return;
      }
      setTarget(null);
      onOpenChange(false);
      onRestored();
      toast.success(t("history.restored"));
    });
  }

  return (
    // The sheet's `side` is physical; the inspector side is the end side.
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={locale === "ar" ? "left" : "right"}>
        <SheetHeader>
          <SheetTitle>{t("history.title")}</SheetTitle>
          <SheetDescription>{t("history.description")}</SheetDescription>
        </SheetHeader>
        <ol className="flex flex-col gap-2 px-4 pb-4">
          {versions.length === 0 && <li className="text-muted-foreground">{t("history.empty")}</li>}
          {versions.map((version, i) => (
            <li key={version.id} className="flex items-center gap-3 rounded-[10px] p-3 ring-1 ring-border ring-inset">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[13px] font-medium">
                  {formatDate(version.published_at, locale, { dateStyle: "medium", timeStyle: "short" })}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {version.author ?? t("history.system")}
                  {i === 0 && ` · ${t("history.live")}`}
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => setTarget(version)}>
                {t("history.restore")}
              </Button>
            </li>
          ))}
        </ol>
      </SheetContent>

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(next) => !next && setTarget(null)}
        title={t("history.restoreTitle")}
        description={t("history.restoreDescription")}
        confirmLabel={t("history.restore")}
        variant="default"
        pending={restoring}
        onConfirm={() => target && restore(target)}
      />
    </Sheet>
  );
}
