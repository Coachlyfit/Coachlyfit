"use client";

import { useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import { RotateCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorHeading, ErrorShell } from "@/components/error-pages/error-shell";
import { DroppedBarbell } from "@/components/error-pages/dropped-barbell";
import { CopyDigest } from "@/components/error-pages/copy-digest";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Unset → the support link is simply not rendered; never guess an address.
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

// Catches errors outside the route groups (each group has its own compact
// error.tsx that stays inside its app shell). Home is "/" because a client
// component can't cheaply know the role; signed-in users are redirected to
// their home by the existing layouts. Only error.digest is ever shown.
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common.errorBoundary.page");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorShell>
      <title>{t("metaTitle")}</title>
      <DroppedBarbell />
      <ErrorHeading title={t("title")} description={t("description")} />
      <div className="flex flex-wrap justify-center gap-2.5">
        <Button className="h-12 gap-2 px-5 text-base" disabled={pending} onClick={() => startTransition(reset)}>
          <RotateCw className="size-4" aria-hidden="true" />
          {pending ? t("retrying") : t("retry")}
        </Button>
        <Link href="/" className={cn(buttonVariants({ variant: "secondary" }), "h-12 px-5 text-base")}>
          {t("home")}
        </Link>
      </div>
      {(error.digest || SUPPORT_EMAIL) && (
        <div className="mt-2 flex w-full flex-col gap-2.5 rounded-[14px] bg-card p-4 text-start ring-1 ring-foreground/10">
          <span className="font-semibold">{t("supportTitle")}</span>
          <span className="text-muted-foreground">{t("supportBody")}</span>
          {error.digest && (
            <div className="flex items-center gap-2 rounded-[10px] bg-muted py-2 ps-3 pe-2">
              <span className="text-muted-foreground">{t("codeLabel")}</span>
              <span dir="ltr" className="flex-1 text-end font-mono font-semibold">
                {error.digest}
              </span>
              <CopyDigest value={error.digest} copyLabel={t("copy")} copiedLabel={t("copied")} />
            </div>
          )}
          {SUPPORT_EMAIL && (
            <a
              href={`mailto:${SUPPORT_EMAIL}${error.digest ? `?subject=${encodeURIComponent(error.digest)}` : ""}`}
              className="font-medium text-primary hover:underline"
            >
              {t("contactSupport")}
            </a>
          )}
        </div>
      )}
    </ErrorShell>
  );
}
