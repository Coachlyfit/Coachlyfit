"use client";

import { useTranslations } from "next-intl";
import { Segmented } from "@/components/ui/segmented";
import type { LibrarySource } from "@/domain/library/library.service";

const SOURCES = ["all", "global", "mine"] as const satisfies readonly LibrarySource[];

/** [All] [Exercise Library] [My Exercises]. Labels differ for admins, who
 * think in "global / coach-created", so the namespace is a prop. */
export function SourceFilter({
  value,
  onChange,
  namespace = "library.source",
}: {
  value: LibrarySource;
  onChange: (value: LibrarySource) => void;
  namespace?: "library.source" | "admin.library.source";
}) {
  const t = useTranslations(namespace);

  return (
    <Segmented
      value={value}
      onChange={onChange}
      label={t("label")}
      options={SOURCES.map((s) => ({ value: s, label: t(s) }))}
    />
  );
}
