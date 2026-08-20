"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { CoachlyLockup } from "@/components/brand/coachly-lockup";
import { cn } from "@/lib/utils";

// Every nav link is a same-page anchor, so there's no drawer below md — the
// links collapse and the CTA, which is the only one that matters on a phone,
// stays visible.
const ANCHORS = ["features", "pricing", "coaches", "faq"] as const;

export function Navbar() {
  const t = useTranslations("marketing.nav");
  const tHero = useTranslations("marketing.hero");

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/[.88] backdrop-blur-[14px]">
      <div className="mx-auto flex h-[70px] max-w-[1200px] items-center gap-9 px-4">
        <Link href="/" className="flex shrink-0 items-center">
          <CoachlyLockup height={24} />
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-medium md:flex">
          {ANCHORS.map((key) => (
            <a key={key} href={`#${key}`} className="text-muted-foreground hover:text-foreground">
              {t(key)}
            </a>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
          <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            {t("login")}
          </Link>
          <Link href="/signup" className={cn(buttonVariants({ size: "sm" }), "hidden sm:inline-flex")}>
            {tHero("cta")}
          </Link>
        </div>
      </div>
    </header>
  );
}
