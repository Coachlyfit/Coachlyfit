"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  onSidebar = false,
}: {
  items?: NavItem[];
  features?: NavFeatures;
  isOwner?: boolean;
  /** Trigger sits on the navy admin bar (sidebar tokens) instead of the page. */
  onSidebar?: boolean;
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
        className={cn(
          // Icon-only below lg; from lg a search-field-shaped trigger.
          "lg:h-11 lg:w-full lg:max-w-105 lg:justify-start lg:gap-2 lg:px-3.5 lg:text-sm",
          onSidebar
            ? "border-transparent bg-sidebar-accent text-sidebar-foreground/70 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground dark:border-transparent dark:bg-sidebar-accent dark:hover:bg-sidebar-accent/80"
            : "bg-card text-muted-foreground"
        )}
      >
        <Search className="size-4" />
        <span className="hidden lg:inline">{t("trigger")}</span>
        <kbd
          className={cn(
            "hidden rounded-md px-1.5 py-0.5 font-mono text-[11px] lg:ms-auto lg:inline",
            onSidebar ? "bg-sidebar-foreground/10 text-sidebar-foreground/70" : "bg-muted text-muted-foreground"
          )}
        >
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
