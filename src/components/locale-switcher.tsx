"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { routing } from "@/i18n/routing";

export function LocaleSwitcher({ className, variant = "outline" }: { className?: string; variant?: "outline" | "ghost" }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const other = routing.locales.find((l) => l !== locale) ?? locale;

  return (
    <Button
      type="button"
      variant={variant}
      size="icon-sm"
      aria-label={t("language")}
      className={cn("font-mono text-[11px] font-semibold uppercase", className)}
      onClick={() => router.replace(pathname, { locale: other })}
    >
      {locale}
    </Button>
  );
}
