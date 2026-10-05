"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Segmented } from "@/components/ui/segmented";
import { usePathname, useRouter } from "@/i18n/navigation";
import { INBOX_FILTERS, type InboxFilter as Filter } from "@/domain/dashboard/coach-home.service";

/** The filter lives in the URL (?inbox=) so the server re-queries with it:
 * filtering the six loaded rows client-side would show "no new check-ins"
 * whenever the newest six happen to be reviewed. */
export function InboxFilter({ value }: { value: Filter }) {
  const t = useTranslations("dashboard.inbox");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function onChange(next: Filter) {
    startTransition(() => {
      router.replace(next === "all" ? pathname : `${pathname}?inbox=${next}`, { scroll: false });
    });
  }

  return (
    <Segmented
      value={value}
      onChange={onChange}
      label={t("filterLabel")}
      options={INBOX_FILTERS.map((filter) => ({ value: filter, label: t(`filter.${filter}`) }))}
      className={pending ? "opacity-70" : undefined}
    />
  );
}
