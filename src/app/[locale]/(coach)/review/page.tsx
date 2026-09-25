import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ReviewService } from "@/domain/progress/review.service";
import { ProgressService } from "@/domain/progress/progress.service";
import { findSimilarNotes } from "@/domain/progress/note-similarity";
import { weightTrend, adherenceAverage } from "@/domain/progress/stats";
import { LedgerService } from "@/domain/ledger/ledger.service";
import { detectPainRepeat, detectMissedReps, repeatedNoteSignal, type Signal } from "@/domain/ledger/signals";
import { suggestReason } from "@/domain/ledger/reasons";
import { EmptyState } from "@/components/ui/empty-state";
import type { AppLocale } from "@/domain/locale";
import type { Database } from "@/lib/supabase/database.types";
import { ReviewConsole, type ReviewPhoto, type ReviewPose, type ReviewQueueEntry } from "./review-console";

type CheckinRow = Database["public"]["Tables"]["checkins"]["Row"];
type MediaRow = Database["public"]["Tables"]["media"]["Row"];

const WORKOUT_WINDOW_DAYS = 7;
const ADHERENCE_BASELINE_LOOKBACK = 6;
const POSES: ReviewPose[] = ["front", "side", "back"];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

/** Nearest checkin weight on or before the given date — used to caption a
 * progress photo with "what did they weigh around then" without requiring
 * the photo's own checkin_id to line up exactly. */
function weightNear(checkins: CheckinRow[], onOrBeforeIso: string): number | null {
  const cutoff = onOrBeforeIso.slice(0, 10);
  let best: { date: string; weight: number } | null = null;
  for (const c of checkins) {
    if (c.weight == null || c.checkin_date > cutoff) continue;
    if (!best || c.checkin_date > best.date) best = { date: c.checkin_date, weight: c.weight };
  }
  return best?.weight ?? null;
}

export default async function ReviewPage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  const t = await getTranslations("review");
  const supabase = await createClient();
  const review = new ReviewService(supabase);
  const progress = new ProgressService(supabase);

  const queue = await review.listPendingQueue();
  if (queue.length === 0) {
    return <EmptyState brandMark title={t("emptyTitle")} description={t("emptyDescription")} />;
  }

  const clientIds = [...new Set(queue.map((c) => c.client_id))];
  const now = new Date();

  const [{ data: allCheckins }, { data: allMedia }, { data: allSessions }, signalInputs] = await Promise.all([
    supabase
      .from("checkins")
      .select("*")
      .in("client_id", clientIds)
      .order("checkin_date", { ascending: true }),
    supabase
      .from("media")
      .select("*")
      .in("client_id", clientIds)
      .eq("kind", "photo")
      .not("pose", "is", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("workout_sessions")
      .select("client_id, completed_at")
      .in("client_id", clientIds)
      .not("completed_at", "is", null)
      .gte("completed_at", isoDaysAgo(WORKOUT_WINDOW_DAYS)),
    new LedgerService(supabase).loadSignalInputs(clientIds),
  ]);

  const checkins = allCheckins ?? [];
  const media = allMedia ?? [];
  const sessions = allSessions ?? [];
  const signed = await progress.signMediaUrls(media.map((m) => m.storage_path));

  const entries: ReviewQueueEntry[] = queue.map((item) => {
    const clientCheckins = checkins.filter((c) => c.client_id === item.client_id);
    const upToNow = clientCheckins.filter((c) => c.checkin_date <= item.checkin_date);
    const trend = weightTrend(upToNow);

    const priorForBaseline = clientCheckins
      .filter((c) => c.checkin_date < item.checkin_date)
      .slice(-ADHERENCE_BASELINE_LOOKBACK);
    const adherenceBaseline = adherenceAverage(priorForBaseline);

    const priorSleep = clientCheckins.filter((c) => c.checkin_date < item.checkin_date && c.sleep_hours != null).at(-1);
    const sleepDelta =
      item.sleep_hours != null && priorSleep?.sleep_hours != null ? item.sleep_hours - priorSleep.sleep_hours : null;

    const workoutsCompleted = sessions.filter((s) => s.client_id === item.client_id).length;

    const priorNotes = clientCheckins
      .filter((c) => c.id !== item.id)
      .map((c) => ({ checkin_date: c.checkin_date, notes: c.notes }));
    const rawSimilarNotes = item.notes ? findSimilarNotes(item.notes, priorNotes) : [];
    const similarNotes = rawSimilarNotes.map((n) => ({ checkinDate: n.checkin_date, text: n.text }));

    // Evidence the platform noticed on its own — see domain/ledger/signals.ts.
    // Keyed by program_item_id, which is exactly what the adjustment
    // picker below (ExerciseMultiSelect) already operates on.
    const signals: Signal[] = [
      ...detectPainRepeat(signalInputs.resultsByClient.get(item.client_id) ?? [], now),
      ...detectMissedReps(signalInputs.logsByClient.get(item.client_id) ?? []),
    ];
    const noteSignal = repeatedNoteSignal(rawSimilarNotes);
    if (noteSignal) signals.push(noteSignal);

    const clientMedia = media.filter(
      (m): m is MediaRow & { pose: ReviewPose } => m.client_id === item.client_id && POSES.includes(m.pose as ReviewPose)
    );

    const photos: Partial<Record<ReviewPose, { newest: ReviewPhoto; oldest: ReviewPhoto }>> = {};
    for (const pose of POSES) {
      const shots = clientMedia
        .filter((m) => m.pose === pose)
        .map((m) => ({ url: signed.get(m.storage_path), date: m.created_at }))
        .filter((p): p is { url: string; date: string } => !!p.url);
      if (shots.length < 2) continue;
      const oldest = shots[0];
      const newest = shots[shots.length - 1];
      photos[pose] = {
        oldest: { ...oldest, weight: weightNear(clientCheckins, oldest.date) },
        newest: { ...newest, weight: weightNear(clientCheckins, newest.date) },
      };
    }

    return {
      checkinId: item.id,
      clientId: item.client_id,
      clientName: item.clients?.display_name ?? "",
      checkinDate: item.checkin_date,
      weight: item.weight,
      weightDelta: trend?.delta ?? null,
      adherence: item.adherence,
      adherenceBaseline,
      sleepHours: item.sleep_hours,
      sleepDelta,
      workoutsCompleted,
      notes: item.notes,
      similarNotes,
      photos,
      signals,
      suggestedReason: suggestReason(signals),
    };
  });

  return <ReviewConsole locale={locale} initialEntries={entries} />;
}
