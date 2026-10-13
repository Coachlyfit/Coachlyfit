"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useRouter } from "@/i18n/navigation";
import { searchClientsForPaletteAction } from "@/app/[locale]/(coach)/palette-search-action";
import { NAV_ITEMS, visibleNavItems, type NavFeatures, type NavItem } from "./nav-items";

type ClientResult = { id: string; display_name: string };

// Self-contained, like ThemeToggle/LocaleSwitcher: owns its own open state
// and renders its own trigger button, so Topbar just mounts it -- no state
// lifted into the (coach) layout (which is a Server Component anyway).
//
// `items` mirrors Sidebar's `items` prop (defaults to NAV_ITEMS, AdminSidebar
// passes ADMIN_NAV_ITEMS) -- Topbar is shared by (coach) and (admin), so the
// palette's nav list has to be swappable the same way the sidebar's is.
export function CommandPalette({
  items = NAV_ITEMS,
  features,
  isOwner,
}: {
  items?: NavItem[];
  features?: NavFeatures;
  isOwner?: boolean;
}) {
  const t = useTranslations("palette");
  const tNav = useTranslations("nav");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<ClientResult[]>([]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Debounced client search -- not a request per keystroke. An empty query
  // just skips scheduling a search; the render below already gates the
  // clients group on query.trim(), so stale results never show for it.
  useEffect(() => {
    if (!query.trim()) return;
    const timer = setTimeout(() => {
      searchClientsForPaletteAction(query).then(setClients);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  function reset() {
    setOpen(false);
    setQuery("");
    setClients([]);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={t("trigger")}
        onClick={() => setOpen(true)}
        className="text-muted-foreground"
      >
        <Search className="size-3.5" />
        <span className="hidden lg:inline">{t("trigger")}</span>
        <kbd className="hidden font-mono text-[10px] text-muted-foreground lg:ms-2 lg:inline">
          {"⌘K"}
        </kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : reset())}
        title={t("trigger")}
        description={t("placeholder")}
      >
        {/* CommandDialog (ui/command.tsx) doesn't wrap children in <Command>
            itself, so the cmdk root has to be supplied here. */}
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t("placeholder")}
          />
          <CommandList>
            <CommandEmpty>{t("empty")}</CommandEmpty>
            <CommandGroup heading={t("navigation")}>
              {visibleNavItems(items, features, isOwner).map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.href}
                    value={tNav(item.labelKey)}
                    onSelect={() => {
                      reset();
                      router.push(item.href);
                    }}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {tNav(item.labelKey)}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {query.trim() && clients.length > 0 && (
              <CommandGroup heading={t("clients")}>
                {clients.map((client) => (
                  <CommandItem
                    key={client.id}
                    value={client.display_name}
                    onSelect={() => {
                      reset();
                      router.push(`/clients/${client.id}`);
                    }}
                  >
                    {client.display_name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
