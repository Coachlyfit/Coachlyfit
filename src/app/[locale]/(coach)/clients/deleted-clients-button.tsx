"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@/i18n/navigation";
import { TrashDialog } from "@/components/shared/trash-dialog";
import type { AppLocale } from "@/domain/locale";
import { listDeletedClientsAction, restoreDeletedClientAction } from "./actions";

/** "Recently deleted" list with Restore and the days left before the daily
 * purge job removes the client for good. */
export function DeletedClientsButton({ locale }: { locale: AppLocale }) {
  const t = useTranslations("clients.deleted");
  const router = useRouter();
  const queryClient = useQueryClient();

  return (
    <TrashDialog
      listArchived={listDeletedClientsAction}
      restore={(id) => restoreDeletedClientAction(locale, id)}
      renderRow={(client) => `${client.displayName} · ${t("daysLeft", { count: client.daysLeft })}`}
      onRestored={() => {
        void queryClient.invalidateQueries({ queryKey: ["clients"] });
        router.refresh();
      }}
      labels={{
        trigger: t("trigger"),
        title: t("title"),
        empty: t("empty"),
        restore: t("restore"),
        restoreFailed: t("restoreFailed"),
      }}
    />
  );
}
