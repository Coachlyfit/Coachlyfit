"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, CloudOff, RefreshCw, Smartphone, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePersistedFlag } from "@/components/messages/use-persisted-flag";
import { discardFailed, retryFailed } from "@/lib/offline/outbox";
import { syncNow } from "@/lib/offline/sync";
import { useOutboxSummary, useSyncState } from "@/lib/offline/use-offline";
import { cn } from "@/lib/utils";

const noSubscribe = () => () => {};

/** iOS Safari outside an installed app: storage there can be evicted after a
 * week without a visit, so installing to the home screen matters most here. */
function useIosBrowser(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => {
      const ios =
        /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone =
        (navigator as Navigator & { standalone?: boolean }).standalone === true ||
        window.matchMedia("(display-mode: standalone)").matches;
      return ios && !standalone;
    },
    () => false,
  );
}

function Banner({ tone, icon, children }: { tone: "warning" | "destructive" | "success" | "info"; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 text-sm font-medium",
        tone === "warning" && "bg-warning-tint text-warning-tint-foreground",
        tone === "destructive" && "bg-destructive-tint text-destructive-tint-foreground",
        tone === "success" && "bg-success-tint text-success-tint-foreground",
        tone === "info" && "bg-info-tint text-info-tint-foreground",
      )}
    >
      <span className="shrink-0 [&>svg]:size-4" aria-hidden="true">
        {icon}
      </span>
      {children}
    </div>
  );
}

/** Offline banner, pending count, synced and failed states. Rendered once by
 * OfflineProvider in the client layout and again inside the workout runner
 * (whose full-screen overlay covers the layout's copy). */
export function SyncStatusBar({ showInstallHint = false }: { showInstallHint?: boolean }) {
  const t = useTranslations("offline");
  const { online, syncing, lastSyncedAt, storage } = useSyncState();
  const { pending, failed } = useOutboxSummary();
  const ios = useIosBrowser();
  const [hintDismissed, dismissHint] = usePersistedFlag("coachly:ios-install-hint", false);

  // "All synced" shows for a few seconds after each successful drain.
  const [seenSyncedAt, setSeenSyncedAt] = useState<number | null>(null);
  useEffect(() => {
    if (lastSyncedAt == null) return;
    const id = setTimeout(() => setSeenSyncedAt(lastSyncedAt), 3500);
    return () => clearTimeout(id);
  }, [lastSyncedAt]);
  const justSynced = lastSyncedAt != null && seenSyncedAt !== lastSyncedAt && pending === 0 && failed === 0;

  const syncButton = (
    <Button size="sm" variant="outline" disabled={syncing} onClick={() => void syncNow()}>
      <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} aria-hidden="true" />
      {syncing ? t("syncing") : t("syncNow")}
    </Button>
  );

  return (
    <div role="status" aria-live="polite">
      {storage === "unavailable" && (
        <Banner tone="warning" icon={<TriangleAlert />}>
          <span className="min-w-0 flex-1 break-words">{t("noStorage")}</span>
        </Banner>
      )}
      {failed > 0 && (
        <Banner tone="destructive" icon={<TriangleAlert />}>
          <span className="min-w-0 flex-1 break-words">{t("syncFailed", { count: failed })}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void retryFailed().then(syncNow);
            }}
          >
            {t("retry")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void discardFailed()}>
            {t("dismiss")}
          </Button>
        </Banner>
      )}
      {!online ? (
        <Banner tone="warning" icon={<CloudOff />}>
          <span className="min-w-0 flex-1 break-words">
            {t("offlineBanner")}
            {pending > 0 && ` · ${t("pendingCount", { count: pending })}`}
          </span>
        </Banner>
      ) : (
        pending > 0 && (
          <Banner tone="info" icon={<RefreshCw />}>
            <span className="min-w-0 flex-1 break-words">{t("pendingCount", { count: pending })}</span>
            {syncButton}
          </Banner>
        )
      )}
      {justSynced && (
        <Banner tone="success" icon={<CheckCircle2 />}>
          <span className="min-w-0 flex-1">{t("synced")}</span>
        </Banner>
      )}
      {showInstallHint && ios && !hintDismissed && (
        <Banner tone="info" icon={<Smartphone />}>
          <span className="min-w-0 flex-1 break-words">{t("iosInstallHint")}</span>
          <Button size="sm" variant="ghost" onClick={() => dismissHint(true)}>
            {t("dismiss")}
          </Button>
        </Banner>
      )}
    </div>
  );
}
