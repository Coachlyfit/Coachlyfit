"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AlertTriangle, ChevronLeft, ChevronRight, Moon, Scale, Dumbbell, Gauge, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { SaveConfirmedMark } from "@/components/brand/save-confirmed-mark";
import { formatDate, formatNumber } from "@/lib/format";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { StructuredAdjustment } from "@/domain/progress/review.service";
import type { Signal } from "@/domain/ledger/signals";
import { REASON_KEYS, type ReasonKey } from "@/domain/ledger/reasons";
import { Link } from "@/i18n/navigation";
import { listActiveProgramItemsAction } from "../programs/actions";
import { submitReviewAction, markCheckinSeenAction } from "./actions";

export type ReviewPhoto = { url: string; date: string; weight: number | null };
export type ReviewPose = "front" | "side" | "back";
export type ReviewPhotoPair = { newest: ReviewPhoto; oldest: ReviewPhoto };

export type ReviewQueueEntry = {
  checkinId: string;
  clientId: string;
  clientName: string;
  checkinDate: string;
  weight: number | null;
  weightDelta: number | null;
  adherence: number | null;
  adherenceBaseline: number | null;
  sleepHours: number | null;
  sleepDelta: number | null;
  workoutsCompleted: number;
  notes: string | null;
  similarNotes: { checkinDate: string; text: string }[];
  photos: Partial<Record<ReviewPose, ReviewPhotoPair>>;
  /** Evidence the platform noticed on its own (domain/ledger/signals.ts) —
   * rendered above the decision panel and, once the coach acts, snapshotted
   * onto the ledger record as the rationale for that decision. */
  signals: Signal[];
  suggestedReason: ReasonKey;
};

const CLIENT_NOTE_MAX = 280;

type Decision = "keep" | "adjust" | "call";

const ADJUSTMENT_KEYS = ["reduceLoad", "extraWarmup", "removeMovement", "extraRestDay"] as const;
const REPLY_CHIP_KEYS = ["encouragement", "nextWeek", "call"] as const;
const POSES: ReviewPose[] = ["front", "side", "back"];
const PERCENT_OPTIONS = [10, 15, 20, 25, 30] as const;

type ActiveProgramItem = Awaited<ReturnType<typeof listActiveProgramItemsAction>>[number];

function toggleInSet<T>(setter: (updater: (prev: Set<T>) => Set<T>) => void, value: T) {
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  });
}

/** Checkbox list for picking specific program_items — shared UI between
 * reduceLoad's optional narrowing and removeMovement's required picker.
 * Each caller owns its own selection state, so checking both adjustments
 * at once doesn't conflate "exercises to reduce load on" with "exercises
 * to remove". */
function ExerciseMultiSelect({
  locale,
  items,
  loading,
  selected,
  onToggle,
}: {
  locale: AppLocale;
  items: ActiveProgramItem[];
  loading: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const t = useTranslations("review.adjustments");
  if (loading) return <p className="text-xs text-warning-tint-foreground/70">{t("loadingExercises")}</p>;
  if (items.length === 0) return <p className="text-xs text-warning-tint-foreground/70">{t("noExercises")}</p>;
  return (
    <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-warning-tint-foreground/20 p-2">
      {items.map((item) => (
        <label key={item.id} className="flex items-center gap-2 text-xs text-warning-tint-foreground">
          <Checkbox checked={selected.has(item.id)} onCheckedChange={() => onToggle(item.id)} />
          {pickLocale(item.exercises, locale)}
        </label>
      ))}
    </div>
  );
}

function adherenceOutOf10(value: number | null): number | null {
  return value == null ? null : Math.round(value / 10);
}

function formatSignedNumber(value: number, locale: AppLocale): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, locale, { maximumFractionDigits: 1 })}`;
}

export function ReviewConsole({ locale, initialEntries }: { locale: AppLocale; initialEntries: ReviewQueueEntry[] }) {
  const t = useTranslations("review");
  const [entries, setEntries] = useState(initialEntries);
  const [index, setIndex] = useState(0);
  const safeIndex = entries.length === 0 ? 0 : Math.min(index, entries.length - 1);
  const current = entries[safeIndex] ?? null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => Math.min(entries.length - 1, i + 1));
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [entries.length]);

  if (!current) {
    return <EmptyState brandMark title={t("emptyTitle")} description={t("emptyDescription")} />;
  }

  function handleReviewed(checkinId: string) {
    setEntries((prev) => prev.filter((e) => e.checkinId !== checkinId));
  }

  const remaining = entries.length - safeIndex - 1;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-xl bg-sidebar p-4 text-sidebar-foreground sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            aria-label={t("close")}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            )}
          >
            <X className="size-4" aria-hidden="true" />
          </Link>
          <div>
            <p className="text-sm font-semibold">{t("title")}</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-sidebar-foreground/60">
              {t("counter", { current: safeIndex + 1, total: entries.length, remaining })}
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {entries.map((entry, i) => (
            <button
              key={entry.checkinId}
              type="button"
              onClick={() => setIndex(i)}
              aria-current={i === safeIndex ? "true" : undefined}
              aria-label={entry.clientName}
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ring-2 transition-opacity",
                tintFor(entry.clientId),
                i === safeIndex ? "opacity-100 ring-sidebar-ring" : "opacity-60 ring-transparent hover:opacity-90"
              )}
            >
              {entry.clientName[0] ?? "?"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:ms-auto">
          <span className="hidden font-mono text-[10px] text-sidebar-foreground/50 sm:inline">{t("keyboardHint")}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={safeIndex === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent"
          >
            {locale === "ar" ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
            {t("prev")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={safeIndex === entries.length - 1}
            onClick={() => setIndex((i) => Math.min(entries.length - 1, i + 1))}
            className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent"
          >
            {t("next")}
            {locale === "ar" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        {/* Keyed on the check-in id so every field below resets for free on
            a fresh mount instead of a reset effect fighting React over who
            owns the "new entry" transition. */}
        <ReviewEntryPanel
          key={current.checkinId}
          locale={locale}
          entry={current}
          onReviewed={handleReviewed}
          onSkip={() => setIndex((i) => Math.min(entries.length - 1, i + 1))}
        />
      </div>
    </div>
  );
}

function ReviewEntryPanel({
  locale,
  entry,
  onReviewed,
  onSkip,
}: {
  locale: AppLocale;
  entry: ReviewQueueEntry;
  onReviewed: (checkinId: string) => void;
  onSkip: () => void;
}) {
  const t = useTranslations("review");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("review.errors");
  const [decision, setDecision] = useState<Decision>("keep");
  const [adjustments, setAdjustments] = useState<Set<string>>(new Set());
  const [reduceLoadPercent, setReduceLoadPercent] = useState<number>(20);
  const [reduceLoadItemIds, setReduceLoadItemIds] = useState<Set<string>>(new Set());
  const [showReduceLoadPicker, setShowReduceLoadPicker] = useState(false);
  const [removeMovementItemIds, setRemoveMovementItemIds] = useState<Set<string>>(new Set());
  const [reasonKey, setReasonKey] = useState<ReasonKey>(entry.suggestedReason);
  const [clientNote, setClientNote] = useState("");
  const [reply, setReply] = useState("");
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [photoMode, setPhotoMode] = useState<"slider" | "side">("slider");
  const [split, setSplit] = useState(50);
  const [pose, setPose] = useState<ReviewPose | null>(null);

  const availablePoses = POSES.filter((p) => entry.photos[p]);
  const activePose = pose && availablePoses.includes(pose) ? pose : (availablePoses[0] ?? null);
  const photoPair = activePose ? entry.photos[activePose] : undefined;

  // Read receipt — fires once per checkin on mount, no loading state, no
  // blocking of render. Idempotent server-side (mark_checkin_seen only sets
  // coach_seen_at on the first call), so nothing guards against re-firing.
  useEffect(() => {
    markCheckinSeenAction(entry.checkinId);
  }, [entry.checkinId]);

  const needsActiveExercises = adjustments.has("reduceLoad") || adjustments.has("removeMovement");
  const { data: activeItems, isPending: exercisesLoading } = useQuery({
    queryKey: ["review", "active-program-items", entry.clientId],
    queryFn: () => listActiveProgramItemsAction(entry.clientId),
    enabled: needsActiveExercises,
  });

  // The program items behind pain/missed-reps evidence — pre-checked the
  // first time the coach turns on a picker below, so "Adjust" usually
  // means confirming what the platform already flagged rather than
  // re-finding it from scratch. repeated_note evidence has no
  // programItemId (nothing to reduce load or remove), so it's excluded.
  const evidenceItemIds = useMemo(
    () => new Set(entry.signals.flatMap((s) => (s.kind === "pain_repeat" || s.kind === "missed_reps" ? [s.programItemId] : []))),
    [entry.signals]
  );

  function toggleAdjustment(key: string) {
    const turningOn = !adjustments.has(key);
    toggleInSet(setAdjustments, key);
    if (turningOn && evidenceItemIds.size > 0) {
      if (key === "reduceLoad" && reduceLoadItemIds.size === 0) setReduceLoadItemIds(new Set(evidenceItemIds));
      if (key === "removeMovement" && removeMovementItemIds.size === 0) setRemoveMovementItemIds(new Set(evidenceItemIds));
    }
  }

  function appendChip(text: string) {
    setReply((prev) => (prev.trim() ? `${prev}\n\n${text}` : text));
  }

  const removeMovementBlocked = adjustments.has("removeMovement") && removeMovementItemIds.size === 0;

  function buildStructuredAdjustments(): StructuredAdjustment[] {
    const list: StructuredAdjustment[] = [];
    if (adjustments.has("reduceLoad")) {
      list.push({ key: "reduceLoad", percent: reduceLoadPercent, itemIds: [...reduceLoadItemIds] });
    }
    if (adjustments.has("removeMovement")) {
      list.push({ key: "removeMovement", itemIds: [...removeMovementItemIds] });
    }
    if (adjustments.has("extraWarmup")) list.push({ key: "extraWarmup" });
    if (adjustments.has("extraRestDay")) list.push({ key: "extraRestDay" });
    return list;
  }

  function onSubmit() {
    if (!reply.trim() || (decision === "adjust" && removeMovementBlocked)) return;
    setFormError(null);
    const formData = new FormData();
    formData.set("checkinId", entry.checkinId);
    formData.set("decision", decision);
    formData.set("coachReply", reply.trim());
    formData.set("reasonKey", reasonKey);
    if (clientNote.trim()) formData.set("clientNote", clientNote.trim());
    formData.set("evidence", JSON.stringify(entry.signals));
    if (decision === "adjust") {
      formData.set("adjustments", JSON.stringify(buildStructuredAdjustments()));
    }
    startTransition(async () => {
      const result = await submitReviewAction(locale, formData);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      setSent(true);
      setTimeout(() => onReviewed(entry.checkinId), 700);
    });
  }

  const adherenceOn10 = adherenceOutOf10(entry.adherence);
  const baselineOn10 = adherenceOutOf10(entry.adherenceBaseline);

  return (
    <>
      {/* Main column */}
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white",
                tintFor(entry.clientId)
              )}
            >
              {entry.clientName[0] ?? "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">{entry.clientName}</p>
              <p className="text-xs text-muted-foreground">{formatDate(entry.checkinDate, locale)}</p>
            </div>
            {adherenceOn10 != null && adherenceOn10 < 5 && <Badge variant="warning">{t("flag.needsAttention")}</Badge>}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard
            icon={Scale}
            label={t("stats.weight")}
            value={entry.weight != null ? formatNumber(entry.weight, locale) : "—"}
            unit="kg"
            delta={
              entry.weightDelta != null
                ? t("stats.deltaFromLast", { delta: formatSignedNumber(entry.weightDelta, locale) })
                : null
            }
            deltaTone={entry.weightDelta == null ? "neutral" : entry.weightDelta <= 0 ? "good" : "warn"}
          />
          <StatCard
            icon={Gauge}
            label={t("stats.adherence")}
            value={adherenceOn10 != null ? String(adherenceOn10) : "—"}
            unit="/10"
            delta={baselineOn10 != null ? t("stats.avgLabel", { avg: baselineOn10 }) : null}
            deltaTone={
              adherenceOn10 == null || baselineOn10 == null ? "neutral" : adherenceOn10 >= baselineOn10 ? "good" : "warn"
            }
          />
          <StatCard
            icon={Moon}
            label={t("stats.sleep")}
            value={entry.sleepHours != null ? formatNumber(entry.sleepHours, locale) : "—"}
            unit="h"
            delta={
              entry.sleepDelta != null
                ? t("stats.deltaFromLast", { delta: formatSignedNumber(entry.sleepDelta, locale) })
                : null
            }
            deltaTone={entry.sleepDelta == null ? "neutral" : entry.sleepDelta >= 0 ? "good" : "warn"}
          />
          <StatCard
            icon={Dumbbell}
            label={t("stats.workouts")}
            value={String(entry.workoutsCompleted)}
            unit=""
            delta={t("stats.workoutsWindow")}
            deltaTone="neutral"
          />
        </div>

        <Card className="overflow-hidden bg-sidebar text-sidebar-foreground">
          <div className="flex flex-wrap items-center gap-3 border-b border-sidebar-border px-4 py-3">
            <p className="text-sm font-semibold">{t("photos.title")}</p>
            {availablePoses.length > 1 && (
              <div className="flex gap-1">
                {availablePoses.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPose(p)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs font-medium",
                      p === activePose
                        ? "border-sidebar-ring bg-sidebar-accent text-sidebar-foreground"
                        : "border-sidebar-border text-sidebar-foreground/60"
                    )}
                  >
                    {t(`photos.pose.${p}`)}
                  </button>
                ))}
              </div>
            )}
            <div className="ms-auto flex gap-1">
              {(["slider", "side"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPhotoMode(m)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-medium",
                    m === photoMode
                      ? "border-sidebar-ring bg-sidebar-accent text-sidebar-foreground"
                      : "border-sidebar-border text-sidebar-foreground/60"
                  )}
                >
                  {t(m === "slider" ? "photos.modeSlider" : "photos.modeSide")}
                </button>
              ))}
            </div>
          </div>

          {!photoPair ? (
            <p className="px-4 py-10 text-center text-sm text-sidebar-foreground/60">{t("photos.empty")}</p>
          ) : photoMode === "slider" ? (
            <div className="p-5">
              <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-lg">
                <img src={photoPair.oldest.url} alt="" className="absolute inset-0 size-full object-cover" />
                <div className="absolute inset-y-0 start-0 overflow-hidden" style={{ width: `${split}%` }}>
                  <img
                    src={photoPair.newest.url}
                    alt=""
                    className="absolute inset-y-0 start-0 h-full max-w-none object-cover"
                    style={{ width: `${(100 / Math.max(split, 1)) * 100}%` }}
                  />
                </div>
                <div
                  className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary"
                  style={{ insetInlineStart: `${split}%` }}
                />
                <span className="absolute top-2 start-2 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                  {formatDate(photoPair.newest.date, locale, { month: "short", day: "numeric" })}
                </span>
                <span className="absolute top-2 end-2 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                  {formatDate(photoPair.oldest.date, locale, { month: "short", day: "numeric" })}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={split}
                  onChange={(e) => setSplit(Number(e.target.value))}
                  aria-label={t("photos.dragHint")}
                  className="absolute inset-0 size-full cursor-ew-resize opacity-0"
                />
              </div>
              <p className="mt-3 text-center text-xs text-sidebar-foreground/60">{t("photos.dragHint")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 p-4 sm:gap-4 sm:p-5">
              {[photoPair.oldest, photoPair.newest].map((photo, i) => (
                <figure key={i} className="flex flex-col items-center gap-2">
                  <img src={photo.url} alt="" className="aspect-[3/4] w-full max-w-40 rounded-lg object-cover" />
                  <figcaption className="font-mono text-[10px] text-sidebar-foreground/60">
                    {formatDate(photo.date, locale, { month: "short", day: "numeric" })}
                    {photo.weight != null && ` · ${formatNumber(photo.weight, locale)} kg`}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{t("note.title")}</p>
            {entry.notes ? (
              <p className="mt-2 text-sm leading-relaxed">«{entry.notes}»</p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">{t("note.empty")}</p>
            )}

            {entry.similarNotes.length > 0 && (
              <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  {t("note.similarTitle")}
                </p>
                {entry.similarNotes.map((n) => (
                  <div key={n.checkinDate} className="flex gap-3 text-xs">
                    <span className="w-16 shrink-0 font-mono text-muted-foreground">
                      {formatDate(n.checkinDate, locale, { month: "short", day: "numeric" })}
                    </span>
                    <span className="text-muted-foreground">{n.text}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right rail */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-4">
        <EvidenceCard signals={entry.signals} />

        <Card>
          <CardContent className="flex flex-col gap-2 pt-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{t("decision.title")}</p>
            <div role="radiogroup" aria-label={t("decision.title")} className="flex flex-col gap-2">
              {(["keep", "adjust", "call"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={decision === key}
                  onClick={() => setDecision(key)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-start transition-colors",
                    decision === key ? "border-primary bg-accent-tint" : "border-border hover:bg-muted/50"
                  )}
                >
                  <span
                    className={cn(
                      "size-4 shrink-0 rounded-full border-2",
                      decision === key ? "border-primary bg-primary" : "border-input"
                    )}
                  />
                  <span className="min-w-0">
                    <span className={cn("block text-sm font-semibold", decision === key && "text-accent-tint-foreground")}>
                      {t(`decision.${key}.title`)}
                    </span>
                    <span className="block text-xs text-muted-foreground">{t(`decision.${key}.sub`)}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-1 flex flex-col gap-2 border-t border-border pt-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{t("reason.title")}</p>
              <div className="flex flex-wrap gap-1.5">
                {REASON_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setReasonKey(key)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium",
                      reasonKey === key
                        ? "border-primary bg-accent-tint text-accent-tint-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    {t(`reason.options.${key}`)}
                  </button>
                ))}
              </div>
              <Textarea
                value={clientNote}
                onChange={(e) => setClientNote(e.target.value.slice(0, CLIENT_NOTE_MAX))}
                placeholder={t("reason.clientNotePlaceholder")}
                className="min-h-16"
              />
              <p className="text-end font-mono text-[10px] text-muted-foreground">
                {clientNote.length}/{CLIENT_NOTE_MAX}
              </p>
            </div>

            {decision === "adjust" && (
              <div className="mt-2 flex flex-col gap-2 rounded-lg border border-warning-tint-foreground/30 bg-warning-tint p-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-warning-tint-foreground">
                  {t("adjustments.title")}
                </p>
                {ADJUSTMENT_KEYS.map((key) => (
                  <div key={key} className="flex flex-col gap-2">
                    <label className="flex items-center gap-2.5 text-sm text-warning-tint-foreground">
                      <Checkbox checked={adjustments.has(key)} onCheckedChange={() => toggleAdjustment(key)} />
                      {t(`adjustments.options.${key}`)}
                    </label>

                    {key === "reduceLoad" && adjustments.has("reduceLoad") && (
                      <div className="ms-6 flex flex-col gap-2 border-s border-warning-tint-foreground/20 ps-3">
                        <label className="flex items-center gap-2 text-xs text-warning-tint-foreground">
                          {t("adjustments.percentLabel")}
                          <select
                            value={reduceLoadPercent}
                            onChange={(e) => setReduceLoadPercent(Number(e.target.value))}
                            className="rounded-md border border-warning-tint-foreground/30 bg-background px-2 py-1 text-base md:text-xs"
                          >
                            {PERCENT_OPTIONS.map((p) => (
                              <option key={p} value={p}>
                                {p}%
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowReduceLoadPicker((v) => !v)}
                          className="text-start text-xs font-medium text-warning-tint-foreground underline underline-offset-2"
                        >
                          {reduceLoadItemIds.size === 0
                            ? t("adjustments.wholeProgram")
                            : t("adjustments.exercisesSelected", { count: reduceLoadItemIds.size })}
                          {" · "}
                          {t("adjustments.pickExercises")}
                        </button>
                        {showReduceLoadPicker && (
                          <ExerciseMultiSelect
                            locale={locale}
                            items={activeItems ?? []}
                            loading={exercisesLoading}
                            selected={reduceLoadItemIds}
                            onToggle={(id) => toggleInSet(setReduceLoadItemIds, id)}
                          />
                        )}
                      </div>
                    )}

                    {key === "removeMovement" && adjustments.has("removeMovement") && (
                      <div className="ms-6 flex flex-col gap-2 border-s border-warning-tint-foreground/20 ps-3">
                        <ExerciseMultiSelect
                          locale={locale}
                          items={activeItems ?? []}
                          loading={exercisesLoading}
                          selected={removeMovementItemIds}
                          onToggle={(id) => toggleInSet(setRemoveMovementItemIds, id)}
                        />
                        {removeMovementBlocked && (
                          <p className="text-xs text-destructive">{t("adjustments.removeMovementHint")}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{t("reply.title")}</p>
            <div className="flex flex-wrap gap-1.5">
              {REPLY_CHIP_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => appendChip(t(`reply.chips.${key}.text`))}
                  className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground hover:border-warning-tint-foreground/40 hover:bg-warning-tint hover:text-warning-tint-foreground"
                >
                  {t(`reply.chips.${key}.label`)}
                </button>
              ))}
            </div>
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={t("reply.placeholder", { name: entry.clientName })}
              className="min-h-32"
            />
            <p className="text-xs text-muted-foreground">{t("reply.deliveryNote")}</p>
            {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2">
          {sent ? (
            <div className="flex h-11 items-center justify-center rounded-lg border border-success/30 bg-success-tint">
              <SaveConfirmedMark show label={t("submit.sent")} />
            </div>
          ) : (
            <Button
              type="button"
              size="lg"
              disabled={pending || !reply.trim() || (decision === "adjust" && removeMovementBlocked)}
              onClick={onSubmit}
              className="min-w-24"
            >
              {pending ? tCommon("pending") : reply.trim() ? t("submit.send") : t("submit.sendDefault")}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onSkip} disabled={sent}>
            {t("submit.skip")}
          </Button>
        </div>
      </div>
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  delta,
  deltaTone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  unit: string;
  delta: string | null;
  deltaTone: "good" | "warn" | "neutral";
}) {
  return (
    <Card className={cn(deltaTone === "warn" && "ring-warning-tint-foreground/30")}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          <Icon className="size-3" aria-hidden="true" />
          {label}
        </div>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="font-mono text-2xl font-semibold tabular-nums">{value}</span>
          {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
        </div>
        {delta && (
          <p
            className={cn(
              "mt-1 text-xs",
              deltaTone === "good" && "text-success",
              deltaTone === "warn" && "text-primary",
              deltaTone === "neutral" && "text-muted-foreground"
            )}
          >
            {delta}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Evidence the platform noticed on its own (domain/ledger/signals.ts),
 * rendered above the decision panel so "Adjust" starts from what's already
 * flagged instead of the coach re-finding it in the stats/notes above.
 * Renders nothing when there's no evidence — same "no permanently-empty
 * box" rule as AttentionStrip. */
function EvidenceCard({ signals }: { signals: Signal[] }) {
  const t = useTranslations("review.evidence");
  if (signals.length === 0) return null;

  return (
    <Card className="border-warning-tint-foreground/30 bg-warning-tint">
      <CardContent className="flex flex-col gap-2 pt-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-warning-tint-foreground">{t("title")}</p>
        {signals.map((signal, i) => (
          <div key={i} className="flex items-start gap-2 text-sm text-warning-tint-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {signal.kind === "pain_repeat" && t("painRepeat", { count: signal.count })}
              {signal.kind === "missed_reps" && t("missedReps", { count: signal.count })}
              {signal.kind === "repeated_note" && t("repeatedNote", { count: signal.count })}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
