"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shared body for every route-group error.tsx. Next requires error.tsx to
 * be a Client Component, and it renders outside the segment's own Suspense
 * boundary but still inside NextIntlClientProvider (set up in the root
 * [locale]/layout.tsx) -- so useTranslations works here same as any other
 * client component. digest (present only in production, when Next strips
 * the real message) is logged for correlation with server logs but never
 * shown to the user. */
export function ErrorBoundaryFallback({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common.errorBoundary");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <AlertTriangle className="size-10 text-destructive" aria-hidden="true" />
      <div className="flex flex-col gap-1.5">
        <p className="text-lg font-semibold">{t("title")}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <Button onClick={reset}>{t("retry")}</Button>
    </div>
  );
}
