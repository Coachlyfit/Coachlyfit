"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";
import { PERIODS, type Period } from "./types";

/** How many months the MRR chart covers, kept in the URL (?period=). */
export function PeriodSelect({ value }: { value: Period }) {
  const t = useTranslations("admin.home.period");
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const items = PERIODS.map((p) => ({ value: String(p), label: t("months", { count: p }) }));

  function pick(next: string) {
    const params = new URLSearchParams(window.location.search);
    if (next === "12") params.delete("period");
    else params.set("period", next);
    const search = params.toString();
    startTransition(() => router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false }));
  }

  return (
    <Select value={String(value)} onValueChange={(v) => pick(v as string)} items={items}>
      <SelectTrigger aria-label={t("label")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
