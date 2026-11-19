"use client";

import { useTranslations } from "next-intl";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SaveState } from "./use-autosave";

export function AutosaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const t = useTranslations("websiteEditor.autosave");

  return (
    <div className="flex min-h-11 items-center gap-2 text-sm" role="status" aria-live="polite">
      {state === "saving" && (
        <>
          <Loader2 className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" />
          <span className="text-muted-foreground">{t("saving")}</span>
        </>
      )}
      {state === "saved" && (
        <>
          <Check className="size-4 text-success-tint-foreground" aria-hidden="true" />
          <span className="text-muted-foreground">{t("saved")}</span>
        </>
      )}
      {state === "error" && (
        <>
          <TriangleAlert className="size-4 text-destructive" aria-hidden="true" />
          <span className="text-destructive">{t("error")}</span>
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onRetry}>
            {t("retry")}
          </Button>
        </>
      )}
    </div>
  );
}
