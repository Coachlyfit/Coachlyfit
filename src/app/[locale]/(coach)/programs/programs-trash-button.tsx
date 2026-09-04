"use client";

import { useRouter } from "@/i18n/navigation";
import { TrashDialog } from "@/components/shared/trash-dialog";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { listArchivedProgramsAction, restoreProgramAction } from "./actions";

export function ProgramsTrashButton({ locale }: { locale: AppLocale }) {
  const router = useRouter();
  return (
    <TrashDialog
      listArchived={listArchivedProgramsAction}
      restore={(id) => restoreProgramAction(locale, id)}
      renderRow={(item) => pickLocale(item, locale)}
      onRestored={() => router.refresh()}
    />
  );
}
