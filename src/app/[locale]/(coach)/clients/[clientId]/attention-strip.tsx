import { getTranslations } from "next-intl/server";
import { AlertTriangle, Clock, MessageCircle, ClipboardCheck, CalendarX, Dumbbell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { isClientLate, lastCheckinDate } from "@/domain/progress/stats";
import { subscriptionDisplayStatus } from "@/domain/billing/client-subscription";
import type { ClientSubscriptionStatus } from "@/domain/billing/client-subscription";
import { getActiveProgram } from "./data";

type Item = { key: string; icon: typeof AlertTriangle; text: string; href?: string };

/** Everything real that needs the coach's attention on this client, in one
 * compact strip — pain reports, an unreviewed check-in, unread messages, a
 * subscription that's expired or about to, going quiet, and having no
 * active program. Renders nothing when there's nothing to flag: a
 * permanently-empty box is worse than no box. Every query here is a
 * narrow, single-purpose read (not a new service method) scoped to this one
 * client — same "direct query in the section component" idiom the rest of
 * this page already uses (billing-section.tsx, workout-section.tsx).
 * `now` is captured once up front — a single per-render clock read, not the
 * inline Date.now()/getTime() calls the React Compiler's purity rule flags
 * when they're scattered through the render body. */
export async function AttentionStrip({ clientId }: { clientId: string }) {
  const t = await getTranslations("clients.profile.attention");
  const supabase = await createClient();
  const now = new Date();
  const painSince = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const outcomeSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [painReports, pendingCheckins, recentCheckins, thread, subscription, program, needsFollowUp] = await Promise.all([
    supabase
      .from("workout_exercise_results")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .gt("pain", 0)
      .gte("created_at", painSince),
    supabase
      .from("checkins")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .is("reviewed_at", null),
    supabase.from("checkins").select("checkin_date").eq("client_id", clientId).order("checkin_date", { ascending: false }).limit(1),
    supabase.from("coach_inbox_threads").select("unread_count").eq("client_id", clientId).maybeSingle(),
    supabase
      .from("client_subscriptions")
      .select("status, end_date")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getActiveProgram(clientId),
    // A Coaching Ledger decision the outcome cron just re-checked and
    // found NOT resolved — see domain/ledger/outcomes.ts. "worse" or
    // "persisting" only: "not_evaluable" means there was nothing to check
    // (no items applied), not a problem worth flagging.
    supabase
      .from("coaching_decisions")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .in("outcome_status", ["worse", "persisting"])
      .gte("evaluated_at", outcomeSince),
  ]);

  const items: Item[] = [];

  if ((painReports.count ?? 0) > 0) {
    items.push({
      key: "pain",
      icon: AlertTriangle,
      text: t("painReports", { count: painReports.count ?? 0 }),
    });
  }

  if ((pendingCheckins.count ?? 0) > 0) {
    items.push({
      key: "review",
      icon: ClipboardCheck,
      text: t("pendingReview", { count: pendingCheckins.count ?? 0 }),
      href: "/review",
    });
  }

  const lastActive = lastCheckinDate(recentCheckins.data ?? []);
  if (isClientLate("active", lastActive, now)) {
    items.push({ key: "late", icon: Clock, text: t("late") });
  }

  const unread = thread.data?.unread_count ?? 0;
  if (unread > 0) {
    items.push({
      key: "unread",
      icon: MessageCircle,
      text: t("unreadMessages", { count: unread }),
      href: `/messages/${clientId}`,
    });
  }

  if (subscription.data) {
    const status = subscriptionDisplayStatus(
      { status: subscription.data.status as ClientSubscriptionStatus, end_date: subscription.data.end_date },
      now
    );
    if (status === "expired") {
      items.push({ key: "sub-expired", icon: CalendarX, text: t("subscriptionExpired") });
    } else if (status === "active") {
      const endOfDay = new Date(`${subscription.data.end_date}T23:59:59.999Z`);
      const daysLeft = Math.ceil((endOfDay.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      if (daysLeft <= 7) items.push({ key: "sub-ending", icon: CalendarX, text: t("subscriptionEnding", { days: daysLeft }) });
    }
  }

  if (!program) {
    items.push({ key: "no-program", icon: Dumbbell, text: t("noProgram") });
  }

  if ((needsFollowUp.count ?? 0) > 0) {
    items.push({
      key: "decision-follow-up",
      icon: AlertTriangle,
      text: t("decisionNeedsFollowUp"),
      href: `/clients/${clientId}?tab=decisions`,
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-warning/30 bg-warning-tint p-3">
      {items.map((item) => {
        const Icon = item.icon;
        const content = (
          <span className="flex items-center gap-2 text-sm text-warning-tint-foreground">
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span>{item.text}</span>
          </span>
        );
        return item.href ? (
          <Link key={item.key} href={item.href} className="hover:underline">
            {content}
          </Link>
        ) : (
          <div key={item.key}>{content}</div>
        );
      })}
    </div>
  );
}
