"use client";

import { MonitorDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/use-install-prompt";

/** Renders only when the browser offers installation (not yet installed). */
export function InstallAppButton({ className }: { className?: string }) {
  const t = useTranslations("common");
  const { canInstall, install } = useInstallPrompt();

  if (!canInstall) return null;

  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label={t("installApp")}
      title={t("installApp")}
      className={className}
      onClick={install}
    >
      <MonitorDown className="size-4" />
    </Button>
  );
}
