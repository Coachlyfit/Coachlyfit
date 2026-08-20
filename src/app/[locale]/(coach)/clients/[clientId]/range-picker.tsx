"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import type { ProgressRange } from "@/domain/progress/stats";

const RANGES: ProgressRange[] = ["7d", "30d", "90d", "all"];

export function RangePicker({ range }: { range: ProgressRange }) {
  const t = useTranslations("progress.range");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const options: SegmentedOption<ProgressRange>[] = RANGES.map((value) => ({ value, label: t(value) }));

  return (
    <Segmented
      value={range}
      onChange={(next) => startTransition(() => router.replace(`${pathname}?range=${next}`))}
      options={options}
      label={t("label")}
      className={pending ? "opacity-60" : undefined}
    />
  );
}
