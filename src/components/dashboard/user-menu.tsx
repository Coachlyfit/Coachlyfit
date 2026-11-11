"use client";

import type { ReactElement, ReactNode } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useTheme } from "next-themes";
import { LogOut, Languages, SunMoon } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/lib/auth/sign-out-action";

/** The account menu (name, language/theme below `sm`, sign out). Shared by the
 * topbar avatar button and the coach sidebar's user card, which pass their own
 * trigger. */
export function UserMenu({
  locale,
  fullName,
  trigger,
  children,
  side = "bottom",
  contentClassName,
}: {
  locale: string;
  fullName: string | null;
  /** The trigger element (e.g. a Button); its contents are `children`. */
  trigger: ReactElement;
  children: ReactNode;
  side?: "top" | "bottom";
  contentClassName?: string;
}) {
  const tCommon = useTranslations("common");
  // Below `sm` there isn't room for the locale/theme buttons next to the
  // title, so they move into this menu; from `sm` up they stay standalone.
  const currentLocale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const otherLocale = routing.locales.find((l) => l !== currentLocale) ?? currentLocale;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger}>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={side} className={contentClassName}>
        {fullName && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>{fullName}</DropdownMenuLabel>
          </DropdownMenuGroup>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="sm:hidden" onClick={() => router.replace(pathname, { locale: otherLocale })}>
          <Languages className="size-4" />
          {tCommon("language")}
        </DropdownMenuItem>
        <DropdownMenuItem className="sm:hidden" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          <SunMoon className="size-4" />
          {tCommon("theme")}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="sm:hidden" />
        <DropdownMenuItem variant="destructive" onClick={() => signOutAction(locale)}>
          <LogOut className="size-4" />
          {tCommon("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
