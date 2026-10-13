import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** Shown in place of a control the coach's plan doesn't include: what it is,
 * and a link to the subscription page where they can ask for a plan change.
 * `feature` picks the sentence from billing.upgrade.*. Display only -- the
 * database refuses the write either way (20261018000001). */
export function UpgradePrompt({
  feature,
  className,
}: {
  feature: "forms_builder" | "custom_library" | "logo" | "slug" | "team_members" | "task_management";
  className?: string;
}) {
  const t = useTranslations("billing.upgrade");

  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground", className)}>
      <Lock className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{t(feature)}</span>
      <Link href="/settings/subscription" className="font-medium text-primary underline-offset-4 hover:underline">
        {t("cta")}
      </Link>
    </p>
  );
}
