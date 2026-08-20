"use client";

import { List, LayoutGrid, Columns3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Segmented } from "@/components/ui/segmented";

export type LibraryView = "list" | "card" | "kanban";

const OPTIONS = [
  { value: "list", icon: List },
  { value: "card", icon: LayoutGrid },
  { value: "kanban", icon: Columns3 },
] as const satisfies readonly { value: LibraryView; icon: typeof List }[];

export function ViewSwitcher({ value, onChange }: { value: LibraryView; onChange: (v: LibraryView) => void }) {
  const t = useTranslations("library.view");

  return (
    <Segmented
      value={value}
      onChange={onChange}
      label={t("label")}
      options={OPTIONS.map((o) => ({ ...o, label: t(o.value) }))}
    />
  );
}
