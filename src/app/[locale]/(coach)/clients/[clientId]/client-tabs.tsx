"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export type ClientTab = "progress" | "nutrition" | "sessions" | "history" | "decisions" | "forms" | "billing" | "notes";

const TABS: ClientTab[] = ["progress", "nutrition", "sessions", "history", "decisions", "forms", "billing", "notes"];

/** Trigger bar only — the active tab's content is chosen server-side in
 * page.tsx (only that tab's Suspense subtree is rendered), so switching
 * tabs is a real navigation (router.replace + startTransition), not a
 * client-side show/hide that would've already fetched every tab's data up
 * front. `children` is just the current tab's already-resolved content. */
export function ClientTabs({ active, children }: { active: ClientTab; children: React.ReactNode }) {
  const t = useTranslations("clients.profile.tabs");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <Tabs
      value={active}
      onValueChange={(next) => {
        if (typeof next !== "string") return;
        startTransition(() => router.replace(`${pathname}?tab=${next}`, { scroll: false }));
      }}
    >
      <TabsList className={pending ? "opacity-60" : undefined}>
        {TABS.map((tab) => (
          <TabsTrigger key={tab} value={tab}>
            {t(tab)}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={active} className="pt-4">
        {children}
      </TabsContent>
    </Tabs>
  );
}
