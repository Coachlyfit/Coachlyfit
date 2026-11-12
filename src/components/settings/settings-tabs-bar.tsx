"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { SettingsTab } from "./settings-preview";

export type SettingsNavTab = SettingsTab | "account";

// The one list of coach settings destinations. The first five are in-page
// views of /settings (?tab=); "account" is the /settings/account route.
export const SETTINGS_NAV_TABS = [
  "identity",
  "billing",
  "packages",
  "portal",
  "brand",
  "account",
] as const satisfies readonly SettingsNavTab[];

const ACCOUNT_PATH = "/settings/account";

export function SettingsTabsBar({
  current = "identity",
  onSelect,
}: {
  /** The in-page tab showing on /settings; ignored on the account route. */
  current?: SettingsTab;
  /** Intercepts a tab change (the shell guards unsaved edits). Without it the
   * bar navigates itself. */
  onSelect?: (next: SettingsNavTab) => void;
}) {
  const t = useTranslations("settings");
  const router = useRouter();
  const pathname = usePathname();
  const listRef = useRef<HTMLDivElement>(null);
  // startsWith, so any nested account route keeps the tab active.
  const active: SettingsNavTab = pathname.startsWith(ACCOUNT_PATH) ? "account" : current;

  useEffect(() => {
    listRef.current?.querySelector("[data-active]")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [active]);

  function select(next: SettingsNavTab) {
    if (next === active) return;
    if (onSelect) onSelect(next);
    else router.push(next === "account" ? ACCOUNT_PATH : `/settings?tab=${next}`);
  }

  return (
    <Tabs value={active} onValueChange={(value) => select(value as SettingsNavTab)}>
      <TabsList
        ref={listRef}
        aria-label={t("tabsLabel")}
        className="w-full gap-1.5 bg-transparent p-0 group-data-horizontal/tabs:h-auto md:w-fit md:gap-1 md:bg-muted md:p-1"
      >
        {SETTINGS_NAV_TABS.map((id) => (
          <TabsTrigger
            key={id}
            value={id}
            className="h-10 flex-none rounded-full border-border px-4 data-active:border-foreground data-active:bg-foreground data-active:text-background md:rounded-lg md:border-transparent md:data-active:border-transparent md:data-active:bg-background md:data-active:text-foreground dark:data-active:border-foreground dark:data-active:bg-foreground dark:data-active:text-background dark:md:data-active:border-input dark:md:data-active:bg-input/30 dark:md:data-active:text-foreground"
          >
            {t(`tabs.${id}`)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
