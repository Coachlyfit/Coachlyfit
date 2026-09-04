"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { History } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { listRevisionsAction, restoreRevisionAction } from "../actions";
import { useRouter } from "@/i18n/navigation";

type Revision = { id: string; reason: string | null; created_at: string };

/** Only meaningful for an assigned program — snapshotIfAssigned
 * (programs.service.ts) skips templates entirely, so this list is always
 * empty for one and the drawer would just show an empty state with no
 * restore option to offer. */
export function RevisionHistoryDrawer({ locale, programId }: { locale: AppLocale; programId: string }) {
  const t = useTranslations("programs.revisions");
  const tErrors = useTranslations("programs.errors");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);
  const [restoring, startTransition] = useTransition();

  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && revisions === null) {
      const rows = await listRevisionsAction(programId);
      setRevisions(rows);
    }
  }

  function confirmRestore() {
    if (!pendingRestore) return;
    const revisionId = pendingRestore;
    startTransition(async () => {
      const result = await restoreRevisionAction(locale, programId, revisionId);
      if (result?.error) {
        toast.error(tErrors.has(result.error) ? tErrors(result.error) : tErrors("unknown"));
        setPendingRestore(null);
        return;
      }
      toast.success(t("restored"));
      setPendingRestore(null);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger render={<Button type="button" variant="outline" size="sm" />}>
          <History className="size-4" />
          {t("title")}
        </SheetTrigger>
        <SheetContent side="bottom" className="h-auto max-h-[85dvh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{t("title")}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-2 overflow-y-auto p-4">
            {revisions === null ? (
              <p className="text-sm text-muted-foreground">{t("loading")}</p>
            ) : revisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            ) : (
              revisions.map((revision) => (
                <div
                  key={revision.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {revision.reason && t.has(`reason.${revision.reason}`)
                        ? t(`reason.${revision.reason}`)
                        : (revision.reason ?? t("unknownReason"))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(revision.created_at, locale, { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPendingRestore(revision.id)}
                  >
                    {t("restore")}
                  </Button>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={!!pendingRestore}
        onOpenChange={(next) => !next && setPendingRestore(null)}
        title={t("confirmRestoreTitle")}
        description={t("confirmRestoreBody")}
        confirmLabel={t("restore")}
        onConfirm={confirmRestore}
        pending={restoring}
      />
    </>
  );
}
