"use client";

import { useRouter } from "@/i18n/navigation";
import { TrashDialog } from "@/components/shared/trash-dialog";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { listArchivedDietPlansAction, restoreDietPlanAction } from "./actions";

export function DietsTrashButton({ locale }: { locale: AppLocale }) {
  const router = useRouter();
  return (
    <TrashDialog
      iconOnly
      listArchived={listArchivedDietPlansAction}
      restore={(id) => restoreDietPlanAction(locale, id)}
      renderRow={(item) => pickLocale(item, locale)}
      onRestored={() => router.refresh()}
    />
  );
}
