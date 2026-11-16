import { AlertTriangle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/** Shown when the Google connection needs the coach to sign in again. The
 * schedule itself keeps working: only the sync to Google is paused. */
export async function GoogleReconnectBanner() {
  const t = await getTranslations("appointments.google");
  return (
    <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-tint p-3 text-sm text-warning-tint-foreground">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        {t("banner")}{" "}
        <Link href="/settings/schedule" className="font-medium underline underline-offset-4">
          {t("reconnect")}
        </Link>
      </p>
    </div>
  );
}
