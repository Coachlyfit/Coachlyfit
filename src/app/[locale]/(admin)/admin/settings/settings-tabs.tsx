"use client";

import { useOptimistic, useTransition } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { SETTINGS_TABS, type SettingsTab } from "./schemas";

/** Tab row for admin settings: underline tabs from md up, scrollable chips
 * below. Built on the base-ui primitive rather than ui/tabs because the
 * vendored variants can't express either look. */
export function SettingsTabs({
  locale,
  tab: initialTab,
  counts,
  panels,
}: {
  locale: AppLocale;
  tab: SettingsTab;
  counts: Partial<Record<SettingsTab, number>>;
  panels: Record<SettingsTab, React.ReactNode>;
}) {
  const t = useTranslations("admin.settings");
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  // The URL (?tab=) is the source of truth; optimistic so the tab switches
  // on click instead of after the server round trip (same as coaches-section).
  const [tab, setTab] = useOptimistic(initialTab);

  function pick(next: SettingsTab) {
    startTransition(() => {
      setTab(next);
      // Audit filters (?action, ?admin, ?page) are dropped on purpose.
      router.replace(next === "general" ? pathname : `${pathname}?tab=${next}`, { scroll: false });
    });
  }

  return (
    <Tabs.Root value={tab} onValueChange={(value) => pick(value as SettingsTab)} className="flex flex-col gap-5">
      <Tabs.List
        aria-label={t("tabsLabel")}
        className="no-scrollbar flex gap-1.5 overflow-x-auto md:gap-6 md:shadow-[inset_0_-1px_0_var(--border)]"
      >
        {SETTINGS_TABS.map((key) => (
          <Tabs.Tab
            key={key}
            value={key}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-base font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-active:border-foreground data-active:bg-foreground data-active:text-background md:h-11.5 md:rounded-none md:border-0 md:border-b-2 md:border-transparent md:bg-transparent md:px-0 md:text-[0.9375rem] md:font-normal md:data-active:border-primary md:data-active:bg-transparent md:data-active:font-semibold md:data-active:text-foreground"
          >
            {t(`tabs.${key}`)}
            {counts[key] != null && (
              <span className="rounded-md bg-muted px-1.5 font-mono text-xs tabular-nums text-foreground">
                {formatNumber(counts[key], locale)}
              </span>
            )}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {SETTINGS_TABS.map((key) => (
        <Tabs.Panel key={key} value={key} className="outline-none">
          {panels[key]}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
