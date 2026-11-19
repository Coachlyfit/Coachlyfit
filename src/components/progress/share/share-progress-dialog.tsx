"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CheckCircle2, Download, Loader2, Share2, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { AppLocale } from "@/domain/locale";
import { heroModel } from "@/domain/progress/share-stats";
import { SHARE_POSES, ShareProgressService, type PoseCounts, type SharePose } from "@/domain/progress/share.service";
import { coachThemeUsable, type CardTheme } from "./card-theme";
import { downloadBlob, renderCardPng, shareOrDownload, type ShareResult } from "./export-card";
import { fetchPhotoBlob, renderPhoto } from "./prep-photo";
import {
  CARD_WIDTH,
  ProgressShareCard,
  cardHeight,
  type CardCoach,
  type CardFormat,
  type CardPhotoState,
} from "./progress-share-card";

const DESKTOP_QUERY = "(min-width: 768px)";

function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** null on the server and during hydration: Dialog and Sheet are different
 * trees, so render neither until the viewport is known. */
function useIsDesktop(): boolean | null {
  return useSyncExternalStore<boolean | null>(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => null
  );
}

type Props = {
  clientId: string;
  clientName: string;
  coach: CardCoach;
  locale: AppLocale;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Mobile: bottom Sheet. Desktop: Dialog. Same body in both; it only mounts
 * while open, so every open starts from the privacy defaults. */
export function ShareProgressDialog(props: Props) {
  const t = useTranslations("progress.share");
  const desktop = useIsDesktop();
  if (desktop === null) return null;

  const title = t("title");
  const description = t("subtitle", { name: props.clientName });

  if (desktop) {
    return (
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent
          className="h-[min(720px,85dvh)] max-w-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[960px]"
        >
          <DialogHeader className="border-b p-6 pe-14">
            <DialogTitle className="text-xl leading-7 font-semibold">{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <ShareBody {...props} layout="dialog" />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] gap-0 overflow-hidden rounded-t-[22px] p-0">
        <SheetHeader className="p-4 pb-3 pe-14">
          <SheetTitle className="text-xl leading-7 font-semibold">{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <ShareBody {...props} layout="sheet" />
      </SheetContent>
    </Sheet>
  );
}

type Status = "idle" | "generating" | "success" | "error";

function defaultPose(counts: PoseCounts | undefined): SharePose {
  if (!counts) return "front";
  return SHARE_POSES.find((p) => counts[p] >= 2) ?? "front";
}

function ShareBody({
  clientId,
  clientName,
  coach,
  locale,
  onOpenChange,
  layout,
}: Props & { layout: "dialog" | "sheet" }) {
  const t = useTranslations("progress.share");
  const tPose = useTranslations("progress.photos.pose");
  const dialog = layout === "dialog";

  // UI state only. Server data stays in the queries below.
  const [pickedPose, setPickedPose] = useState<SharePose | null>(null);
  const [format, setFormat] = useState<CardFormat>("story");
  const [theme, setTheme] = useState<CardTheme>("light");
  const [showWeight, setShowWeight] = useState(false);
  const [showAdherence, setShowAdherence] = useState(false);
  const [showDuration, setShowDuration] = useState(true);
  const [showLogo, setShowLogo] = useState(true);
  const [blur, setBlur] = useState(true);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [lastAction, setLastAction] = useState<"share" | "download">("share");
  const [lastResult, setLastResult] = useState<ShareResult>("downloaded");
  const cardRef = useRef<HTMLDivElement>(null);

  const service = useMemo(() => new ShareProgressService(createClient()), []);

  const counts = useQuery({
    queryKey: ["share", "counts", clientId],
    queryFn: () => service.poseCounts(clientId),
  });
  const pose = pickedPose ?? defaultPose(counts.data);

  const pair = useQuery({
    queryKey: ["share", "pair", clientId, pose],
    queryFn: () => service.photoPair(clientId, pose),
    enabled: counts.isSuccess,
    staleTime: 5 * 60_000,
  });
  const pairData = pair.data ?? null;

  const stats = useQuery({
    queryKey: ["share", "stats", clientId, pairData?.before.id, pairData?.after.id],
    queryFn: () => service.windowStats(clientId, pairData!.before.createdAt, pairData!.after.createdAt),
    enabled: !!pairData,
  });

  const blobs = useQuery({
    queryKey: ["share", "blobs", clientId, pairData?.before.id, pairData?.after.id],
    queryFn: async () => {
      const [before, after] = await Promise.all([
        fetchPhotoBlob(pairData!.before.url),
        fetchPhotoBlob(pairData!.after.url),
      ]);
      return { before, after };
    },
    enabled: !!pairData,
    staleTime: Infinity,
  });

  const photos = useQuery({
    queryKey: ["share", "photos", clientId, pairData?.before.id, pairData?.after.id, blur],
    queryFn: async () => ({
      before: await renderPhoto(blobs.data!.before, blur),
      after: await renderPhoto(blobs.data!.after, blur),
    }),
    enabled: !!blobs.data,
    staleTime: Infinity,
    gcTime: 0,
  });

  // Object URLs are revoked when they are replaced (blur toggled, pose changed).
  const photoUrls = photos.data;
  useEffect(
    () => () => {
      if (!photoUrls) return;
      URL.revokeObjectURL(photoUrls.before);
      URL.revokeObjectURL(photoUrls.after);
    },
    [photoUrls]
  );

  const loadFailed = counts.isError || pair.isError || blobs.isError || photos.isError;
  const loading = !loadFailed && (counts.isPending || (counts.isSuccess && pair.isPending));
  const empty = !loadFailed && !loading && pairData === null;
  const photoState: CardPhotoState = photos.data ? "ready" : "loading";

  const delta = stats.data?.weightDelta ?? null;
  const adherence = stats.data?.adherence ?? null;
  const weeks = pairData?.weeks ?? 1;
  const hero = heroModel({ showWeight, showDuration, delta, weeks });
  const coachThemeOk = coachThemeUsable({ primary: coach.primary, accent: coach.accent });
  const activeTheme: CardTheme = theme === "coach" && !coachThemeOk ? "light" : theme;

  const height = cardHeight(format);
  const scale = dialog ? (format === "story" ? 0.27 : 0.32) : format === "story" ? 0.15 : 0.2;
  const previewW = Math.round(CARD_WIDTH * scale);
  const previewH = Math.round(height * scale);
  const dims = `${CARD_WIDTH}×${height}`;

  const busy = status === "generating";
  const ready = !loading && !empty && !loadFailed && !!photos.data;
  const cannot = !consent || !ready || busy;
  const fmtN = (n: number) => formatNumber(n, locale);

  async function run(action: "share" | "download") {
    const el = cardRef.current;
    if (!el || cannot) return;
    setLastAction(action);
    setStatus("generating");
    try {
      const blob = await renderCardPng(el, CARD_WIDTH, height);
      const filename = `coachly-progress-${format}.png`;
      if (action === "share") {
        const result = await shareOrDownload(blob, filename, t("shareTitle", { name: clientName }));
        if (result === "cancelled") {
          setStatus("idle");
          return;
        }
        setLastResult(result);
      } else {
        downloadBlob(blob, filename);
        setLastResult("downloaded");
      }
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  function retryLoad() {
    void counts.refetch();
    void pair.refetch();
    void blobs.refetch();
    void photos.refetch();
  }

  const poseGroup = (
    <Segmented
      label={t("pose")}
      value={pose}
      onChange={(p) => {
        setPickedPose(p);
        setStatus("idle");
      }}
      disabled={busy}
      options={SHARE_POSES.map((p) => ({
        value: p,
        label: tPose(p),
        count: counts.data ? fmtN(counts.data[p]) : undefined,
      }))}
    />
  );

  /* ---------- body ---------- */
  let body: ReactNode;

  if (loading) {
    body = (
      <div aria-busy="true" className={cn("flex gap-5 p-4", dialog ? "flex-row p-6" : "flex-col")}>
        <Skeleton className={cn("shrink-0 rounded-[14px]", dialog ? "h-full min-h-80 w-[352px]" : "h-[300px] w-full")} />
        <div className="flex flex-1 flex-col gap-3.5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-11 rounded-[11px]" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-11 rounded-[11px]" />
          <Skeleton className="h-[52px]" />
          <Skeleton className="h-[52px]" />
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t("loading")}
          </p>
        </div>
      </div>
    );
  } else if (loadFailed) {
    body = (
      <div className="flex flex-col items-start gap-3 p-4 sm:p-6">
        <Banner tone="error" title={t("errorTitle")}>
          {t("loadError")}
        </Banner>
        <Button variant="outline" onClick={retryLoad}>
          {t("retry")}
        </Button>
      </div>
    );
  } else if (empty) {
    const n = counts.data?.[pose] ?? 0;
    body = (
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div className="mx-auto w-full max-w-lg">{poseGroup}</div>
        <div className="flex flex-col items-center gap-2 rounded-[14px] bg-muted/40 p-6 text-center ring-1 ring-foreground/10">
          <h3 className="text-lg leading-[26px] font-semibold">{t("emptyTitle")}</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            {t("emptyBody", { name: clientName, count: n, n: fmtN(n), pose: tPose(pose) })}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">{t("emptyHint")}</p>
        </div>
      </div>
    );
  } else {
    const preview = (
      <div
        className={cn(
          "relative flex items-center justify-center bg-muted",
          dialog ? "min-h-0 p-6" : "h-[300px] shrink-0 rounded-[14px]"
        )}
      >
        <div
          dir="ltr"
          className="relative overflow-hidden rounded-lg bg-white shadow-md ring-1 ring-foreground/10"
          style={{ width: previewW, height: previewH }}
        >
          <div style={{ width: CARD_WIDTH, height, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
            <ProgressShareCard
              ref={cardRef}
              format={format}
              theme={activeTheme}
              locale={locale}
              coach={coach}
              pose={pose}
              beforeSrc={photos.data?.before ?? null}
              afterSrc={photos.data?.after ?? null}
              photoState={photoState}
              hero={hero}
              weeks={weeks}
              adherence={showAdherence ? adherence : null}
              showDuration={showDuration}
              showLogo={showLogo}
            />
          </div>
          {busy && (
            <div
              role="status"
              className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-white/80 text-sm font-medium text-foreground"
            >
              <Loader2 className="size-7 animate-spin text-primary" aria-hidden="true" />
              <span>{t("generating")}</span>
            </div>
          )}
        </div>
        <span className="absolute start-2.5 bottom-2.5 rounded-md bg-background px-2 text-xs leading-5 font-medium ring-1 ring-foreground/10">
          {t("previewTag")} · <span className="font-mono">{dims}</span>
        </span>
      </div>
    );

    const controls = (
      <div className={cn("flex flex-col gap-5", dialog ? "min-h-0 overflow-y-auto p-6" : "")}>
        {status === "success" && (
          <Banner tone="success" title={t("successTitle")}>
            {lastResult === "shared" ? t("sharedBody") : t("savedBody", { size: dims })}
          </Banner>
        )}
        {status === "error" && (
          <Banner tone="error" title={t("errorTitle")}>
            {t("errorBody")}
          </Banner>
        )}

        {poseGroup}
        <Segmented
          label={t("format")}
          value={format}
          onChange={setFormat}
          disabled={busy}
          options={[
            { value: "story", label: t("formatStory") },
            { value: "feed", label: t("formatFeed") },
          ]}
        />
        <div className="flex flex-col gap-1.5">
          <Segmented
            label={t("theme")}
            value={activeTheme}
            onChange={setTheme}
            disabled={busy}
            options={[
              { value: "light", label: t("themeLight") },
              { value: "dark", label: t("themeDark") },
              { value: "coach", label: t("themeCoach"), disabled: !coachThemeOk },
            ]}
          />
          {!coachThemeOk && <p className="text-sm text-muted-foreground">{t("themeCoachUnavailable")}</p>}
        </div>

        <div className="flex flex-col">
          <span className="pb-0.5 text-sm font-medium">{t("showOnCard")}</span>
          <SwitchRow
            label={t("weight")}
            help={delta == null ? t("weightNoData") : t("weightHelp")}
            checked={showWeight && delta != null}
            onChange={setShowWeight}
            disabled={busy || delta == null}
          />
          <SwitchRow
            label={t("adherence")}
            help={adherence == null ? t("adherenceNoData") : undefined}
            checked={showAdherence && adherence != null}
            onChange={setShowAdherence}
            disabled={busy || adherence == null}
          />
          <SwitchRow
            label={t("duration")}
            help={t("durationHelp", { count: weeks, n: fmtN(weeks) })}
            checked={showDuration}
            onChange={setShowDuration}
            disabled={busy}
          />
          <SwitchRow label={t("logo")} checked={showLogo} onChange={setShowLogo} disabled={busy} />
        </div>

        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <ShieldCheck className="size-4" aria-hidden="true" />
            {t("privacy")}
          </span>
          <div className="rounded-[10px] px-3 ring-1 ring-foreground/10">
            <SwitchRow label={t("blur")} help={t("blurHelp")} checked={blur} onChange={setBlur} disabled={busy} last />
          </div>
        </div>
      </div>
    );

    body = dialog ? (
      <div className="grid min-h-0 grid-cols-[400px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)]">
        {preview}
        {controls}
      </div>
    ) : (
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-5">
        {preview}
        {controls}
      </div>
    );
  }

  /* ---------- footer ---------- */
  const showActions = !loading && !empty && !loadFailed;
  const consentBox = showActions && (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-[10px] border p-2.5",
        dialog && "min-w-0 flex-1",
        consent ? "border-success/30 bg-success-tint" : "border-warning/40 bg-warning-tint"
      )}
    >
      <Checkbox
        checked={consent}
        onCheckedChange={(c) => setConsent(c === true)}
        disabled={busy}
        required
        className="mt-0.5 size-5"
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-sm leading-5 font-medium">
          {t("consent")}{" "}
          <span aria-hidden="true" className="text-primary">
            *
          </span>
        </span>
        <span className={cn("text-sm leading-5", consent ? "text-success-tint-foreground" : "text-warning-tint-foreground")}>
          {consent ? t("consentConfirmed") : t("consentRequired")}
        </span>
      </span>
    </label>
  );

  let actions: ReactNode = null;
  if (showActions && status === "success") {
    actions = (
      <>
        <Button variant="outline" className={actionCls(dialog)} onClick={() => run("share")} disabled={cannot}>
          {t("shareAgain")}
        </Button>
        <Button className={actionCls(dialog)} onClick={() => onOpenChange(false)}>
          {t("done")}
        </Button>
      </>
    );
  } else if (showActions && status === "error") {
    actions = (
      <>
        <Button variant="outline" className={actionCls(dialog)} onClick={() => setStatus("idle")}>
          {t("cancel")}
        </Button>
        <Button className={actionCls(dialog)} onClick={() => run(lastAction)} disabled={cannot}>
          {t("retry")}
        </Button>
      </>
    );
  } else if (showActions) {
    actions = (
      <>
        <Button variant="outline" className={actionCls(dialog)} onClick={() => run("download")} disabled={cannot}>
          <Download className="size-4" aria-hidden="true" />
          {t("download")}
        </Button>
        <Button className={actionCls(dialog)} onClick={() => run("share")} disabled={cannot}>
          {busy && lastAction === "share" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Share2 className="size-4" aria-hidden="true" />
          )}
          {busy && lastAction === "share" ? t("creating") : t("share")}
        </Button>
      </>
    );
  }

  return (
    <>
      <div className={cn("min-h-0", dialog ? "grid grid-rows-[minmax(0,1fr)]" : "flex flex-1 flex-col overflow-hidden")}>{body}</div>
      {showActions && (
        <div
          className={cn(
            "flex border-t bg-popover",
            dialog ? "items-center gap-4 px-6 py-3.5" : "flex-col gap-2.5 px-4 pt-3 pb-5"
          )}
        >
          {consentBox}
          <div className={cn("flex gap-2", dialog ? "shrink-0" : "w-full")}>{actions}</div>
        </div>
      )}
    </>
  );
}

const actionCls = (dialog: boolean) => (dialog ? "min-w-[150px]" : "min-w-0 flex-1");

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: string; disabled?: boolean }[];
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <ToggleGroup
        aria-label={label}
        value={[value]}
        // Re-pressing the active item would empty the group; keep one selected.
        onValueChange={(next) => next[0] && onChange(next[0] as T)}
        disabled={disabled}
        className="grid w-full rounded-[11px] bg-muted p-[3px]"
        style={{ "--gap": 0.5, gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } as CSSProperties}
      >
        {options.map((o) => (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            disabled={o.disabled}
            className="h-[38px] min-w-0 gap-1.5 rounded-lg px-1.5 text-sm font-medium text-muted-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
          >
            <span className="truncate">{o.label}</span>
            {o.count !== undefined && (
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{o.count}</span>
            )}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

function SwitchRow({
  label,
  help,
  checked,
  onChange,
  disabled,
  last = false,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <div className={cn("flex min-h-[52px] items-center gap-3 py-1.5", !last && "border-b")}>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm leading-5 font-medium">{label}</span>
        {help && <span className="text-sm leading-5 text-muted-foreground">{help}</span>}
      </div>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function Banner({
  tone,
  title,
  children,
}: {
  tone: "success" | "error";
  title: string;
  children: ReactNode;
}) {
  const Icon = tone === "success" ? CheckCircle2 : TriangleAlert;
  return (
    <div
      role={tone === "success" ? "status" : "alert"}
      className={cn(
        "flex items-start gap-3 rounded-[10px] px-3.5 py-3",
        tone === "success"
          ? "bg-success-tint text-success-tint-foreground"
          : "bg-destructive-tint text-destructive-tint-foreground"
      )}
    >
      <Icon className="mt-px size-5 shrink-0" aria-hidden="true" />
      <div className="flex flex-col gap-0.5 text-sm">
        <strong className="font-semibold">{title}</strong>
        <span>{children}</span>
      </div>
    </div>
  );
}
