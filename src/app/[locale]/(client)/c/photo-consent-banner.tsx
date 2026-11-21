"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, X } from "lucide-react";
import { Link } from "@/i18n/navigation";

const KEY = "coachly:photoConsentBannerDismissed";
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

// Storage can throw (private mode, blocked site data): treat as not dismissed.
function isDismissed() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** One-time note on Home after the client agrees to share their photos. The
 * full card (photos + Withdraw) lives on the Progress tab. Dismissal is kept
 * in localStorage; once dismissed it never shows again on this device. */
export function PhotoConsentBanner() {
  const t = useTranslations("photoConsent");
  // Server snapshot = dismissed, so nothing flashes before hydration.
  const dismissed = useSyncExternalStore(subscribe, isDismissed, () => true);
  if (dismissed) return null;

  function dismiss() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    listeners.forEach((cb) => cb());
  }

  return (
    <div role="status" className="flex items-center gap-3 rounded-xl border border-border bg-card ps-4 pe-2 py-2">
      <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">{t("bannerText")}</p>
      <Link href="/c/progress" className="shrink-0 text-sm font-medium underline-offset-4 hover:underline">
        {t("bannerView")}
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("bannerDismiss")}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
