import { CreditCard } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/** Rendered in the (coach) layout while the subscription needs attention but
 * still grants access: past due (grace period), or a trial about to end.
 * See coachAccess() in src/domain/billing/access.ts. No dismiss, same as
 * AnnouncementBanner. */
export async function SubscriptionBanner({ kind, days }: { kind: "pastDue" | "trialEnding"; days: number }) {
  const t = await getTranslations("billing.banner");

  return (
    <div className="flex flex-wrap items-center gap-2.5 bg-warning-tint px-4 py-2 text-sm font-medium text-warning-tint-foreground">
      <CreditCard className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words">{t(kind, { days })}</span>
      <Link href="/settings/subscription" className="shrink-0 underline underline-offset-2 hover:no-underline">
        {t("cta")}
      </Link>
    </div>
  );
}
