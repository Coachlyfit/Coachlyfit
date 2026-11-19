"use client";

import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** The page failed to load: a full card, Retry and Contact support. */
export default function WebsiteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("websiteEditor.loadError");
  return (
    <div role="alert" className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl bg-card p-8 text-center ring-1 ring-foreground/10">
      <TriangleAlert className="size-8 text-destructive" aria-hidden="true" />
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("text")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" className="min-h-11.5" onClick={reset}>
          {t("retry")}
        </Button>
        <Link href="/support" className={cn(buttonVariants({ variant: "outline" }), "min-h-11.5")}>
          {t("support")}
        </Link>
      </div>
    </div>
  );
}
