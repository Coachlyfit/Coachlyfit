"use client";

import { useId, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import type { AppLocale } from "@/domain/locale";
import { formatDate } from "@/lib/format";
import { discardDraftAction, setLiveAction } from "@/app/[locale]/(coach)/website/actions";

/** "Site is live", the draft-vs-published status, and Publish / Discard /
 * View site. Publishing itself is done by the shell (it owns the draft). */
export function PublishPanel({
  isLive,
  everPublished,
  publishedAt,
  changes,
  canPublish,
  canDiscard,
  publishing,
  siteUrl,
  onPublish,
  onLiveChange,
  onDiscarded,
}: {
  isLive: boolean;
  everPublished: boolean;
  publishedAt: string | null;
  changes: number;
  canPublish: boolean;
  /** False while an autosave is pending: discarding then could be overwritten. */
  canDiscard: boolean;
  publishing: boolean;
  siteUrl: string;
  onPublish: () => void;
  onLiveChange: (live: boolean) => void;
  onDiscarded: () => void;
}) {
  const t = useTranslations("websiteEditor.publish");
  const tErr = useTranslations("websiteEditor.errors");
  const tMain = useTranslations("websiteEditor");
  const locale = useLocale() as AppLocale;
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const fail = (code: string) => {
    toast.error(tErr.has(code as "generic") ? tErr(code as "generic") : t("toggleFailed"));
  };

  function toggleLive(next: boolean) {
    startTransition(async () => {
      const res = await setLiveAction(next);
      if (res?.error) return fail(res.error);
      onLiveChange(next);
    });
  }

  function discard() {
    startTransition(async () => {
      const res = await discardDraftAction();
      setConfirming(false);
      if (res?.error) return fail(res.error);
      onDiscarded();
      toast.success(t("discarded"));
    });
  }

  return (
    <section aria-labelledby={`${uid}-title`} className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <h2 id={`${uid}-title`} className="text-base font-semibold">
        {t("title")}
      </h2>

      <div className="flex items-start justify-between gap-3">
        <div>
          <label htmlFor={`${uid}-live`} className="text-sm font-medium">
            {t("live")}
          </label>
          <p id={`${uid}-live-hint`} className="text-sm text-muted-foreground">
            {isLive ? t("liveOn") : t("liveOff")}
          </p>
        </div>
        <Switch
          id={`${uid}-live`}
          checked={isLive}
          disabled={pending || !everPublished}
          onCheckedChange={toggleLive}
          aria-describedby={`${uid}-live-hint`}
          className="data-[size=default]:h-6 data-[size=default]:w-10"
        />
      </div>

      <div className="flex flex-col gap-1 border-t border-foreground/10 pt-3 text-sm">
        <p className="font-medium">{changes > 0 ? tMain("changes", { count: changes }) : tMain("allPublished")}</p>
        <p className="text-muted-foreground">
          {publishedAt ? t("lastPublished", { when: formatDate(publishedAt, locale, { dateStyle: "medium", timeStyle: "short" }) }) : t("neverPublished")}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11" disabled={!canPublish || publishing || (everPublished && changes === 0)} onClick={onPublish}>
          {tMain("publishChanges")}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={changes === 0 || !canDiscard || pending} onClick={() => setConfirming(true)}>
          {t("discard")}
        </Button>
        <a
          href={siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-4 text-sm font-medium ring-1 ring-foreground/20 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {tMain("viewSite")}
          <ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </a>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("discardTitle")}
        description={t("discardText")}
        confirmLabel={t("discard")}
        onConfirm={discard}
        pending={pending}
      />
    </section>
  );
}
