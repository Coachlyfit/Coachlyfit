"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ className, variant = "outline" }: { className?: string; variant?: "outline" | "ghost" }) {
  const t = useTranslations("common");
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant={variant}
      size="icon-sm"
      aria-label={t("theme")}
      className={className}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {/* next-themes sets the `dark` class before hydration, so CSS alone
          (not JS state) decides which icon shows — no mounted-state hack,
          no hydration mismatch. */}
      <Sun className="hidden size-4 dark:block" />
      <Moon className="size-4 dark:hidden" />
    </Button>
  );
}
