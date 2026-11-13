import { createClient } from "@/lib/supabase/server";
import { ProgressService } from "@/domain/progress/progress.service";
import { WorkoutsService } from "@/domain/workouts/workouts.service";
import { ProgramsService } from "@/domain/programs/programs.service";
import { ActivityLogsService } from "@/domain/workouts/activity-logs.service";
import { DietPlansService } from "@/domain/nutrition/diet-plans.service";
import { NutritionLogsService } from "@/domain/nutrition/nutrition-logs.service";
import { LedgerService } from "@/domain/ledger/ledger.service";
import { RelationshipsService } from "@/domain/relationships/relationships.service";
import { resolveDayPlan } from "@/domain/programs/day-plan";
import { programWeekProgress, startOfWeekSaturday } from "@/domain/programs/program-cycle";
import { weekWorkoutCounts } from "@/domain/programs/week-workouts";
import { adherenceAverage, checkinStreak } from "@/domain/progress/stats";
import type { StructuredAdjustment } from "@/domain/progress/review.service";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { AVATARS_BUCKET } from "@/domain/avatars/avatar.service";
import { HomeHeader } from "@/components/client-home/home-header";
import { CheckinBanner } from "@/components/client-home/checkin-banner";
import { WeightCard } from "@/components/client-home/weight-card";
import { StatTiles } from "@/components/client-home/stat-tiles";
import { TodaySection, type NutritionToday, type TodaySession } from "@/components/client-home/today-section";
import { CoachRow } from "@/components/client-home/coach-row";
import { CoachDecisionCard } from "./coach-decision-card";
import { CoachInviteCard } from "./coach-invite-card";
import { nextDueForm } from "./home-data";

export default async function ClientHomePage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: clientRow }] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user!.id).single(),
    supabase.from("clients").select("id, coach_id, coaches(business_name)").eq("profile_id", user!.id).single(),
  ]);

  const avatarUrl = profile?.avatar_url
    ? supabase.storage.from(AVATARS_BUCKET).getPublicUrl(profile.avatar_url).data.publicUrl
    : null;

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const weekStart = startOfWeekSaturday(todayIso);

  const progress = new ProgressService(supabase);
  const programs = new ProgramsService(supabase);
  const workouts = new WorkoutsService(supabase);
  const dietPlans = new DietPlansService(supabase);
  const nutritionLogs = new NutritionLogsService(supabase);

  // Invoice count: RLS scopes it to this client's own non-draft invoices,
  // so the link only shows once a coach has actually issued one.
  const [history, tree, latestDecision, { count: invoiceCount }, coachInvites, dueForm, stats, standaloneDiet, todayLogs] =
    await Promise.all([
      clientRow ? progress.listCheckins(clientRow.id) : [],
      clientRow ? programs.getActiveTreeForClient(clientRow.id) : null,
      clientRow ? new LedgerService(supabase).latestUnseenForClient(clientRow.id) : null,
      supabase.from("invoices").select("id", { count: "exact", head: true }),
      new RelationshipsService(supabase).listPending(),
      nextDueForm(supabase, locale),
      clientRow ? workouts.completedStats(clientRow.id, weekStart) : { total: 0, weekStartedAt: [] as string[] },
      clientRow ? dietPlans.getActiveTreeForClient(clientRow.id) : null,
      clientRow ? nutritionLogs.listLogs(clientRow.id, todayIso, todayIso) : [],
    ]);

  const plan = tree ? resolveDayPlan(tree, todayIso) : null;

  // Today's diet: the program day's linked variant, else the client's
  // standalone active plan (same resolution as the Nutrition tab).
  const [session, activityLogs, variantDiet, sessionRows] = await Promise.all([
    plan?.day ? workouts.getSessionForDay(plan.day.id, weekStart) : null,
    clientRow ? new ActivityLogsService(supabase).listForDate(clientRow.id, todayIso) : [],
    plan?.dietPlanId && plan.dietPlanId !== standaloneDiet?.id ? dietPlans.getTree(plan.dietPlanId) : null,
    // The day's extra sessions (an AM/PM split), each with its own done/resume state.
    Promise.all(
      (plan?.sessions ?? []).map(async (day): Promise<TodaySession> => {
        const logged = await workouts.getSessionForDay(day.id, weekStart);
        const workout = day.program_items.filter((i) => i.block !== "mobility" && i.block !== "rehab");
        return {
          id: day.id,
          label: day.label_ar || day.label_en ? pickLocale(day, locale, "label") : null,
          exercises: workout.length,
          sets: workout.reduce((sum, i) => sum + i.sets, 0),
          state: logged?.completed_at != null ? "done" : logged ? "resume" : "new",
        };
      })
    ),
  ]);
  const diet = variantDiet ?? standaloneDiet;

  const workoutState = session?.completed_at != null ? "done" : session ? "resume" : "new";
  const nutrition: NutritionToday | null = diet
    ? {
        targetKcal: diet.target_kcal,
        eatenKcal: todayLogs[0]?.kcal ?? null,
        meals: diet.meals
          .filter((m) => m.time_of_day)
          .map((m) => ({
            label: m.label_ar || m.label_en ? pickLocale(m, locale, "label") : null,
            time: m.time_of_day!.slice(0, 5),
          })),
      }
    : null;

  const weightPoints = history.flatMap((c) => (c.weight != null ? [{ date: c.checkin_date, value: c.weight }] : []));

  return (
    // data-wide: opts this page into the client layout's lg:max-w-5xl.
    <div data-wide className="flex flex-col gap-4">
      <HomeHeader
        locale={locale}
        userId={user!.id}
        name={profile?.full_name ?? ""}
        avatarUrl={avatarUrl}
        program={tree ? programWeekProgress(tree.start_date, tree.end_date, todayIso) : null}
        workouts={tree ? weekWorkoutCounts(tree, weekStart, stats.weekStartedAt) : { planned: 0, done: 0 }}
      />

      {coachInvites.map((invite) => (
        <CoachInviteCard
          key={invite.id}
          locale={locale}
          invite={{ id: invite.id, businessName: invite.coaches?.business_name ?? null }}
        />
      ))}

      <CoachDecisionCard
        decision={
          latestDecision
            ? {
                id: latestDecision.id,
                decision: latestDecision.decision as "keep" | "adjust" | "call",
                reasonKey: latestDecision.reason_key,
                clientNote: latestDecision.client_note,
                adjustments: (latestDecision.adjustments ?? []) as unknown as StructuredAdjustment[],
              }
            : null
        }
      />

      {dueForm && <CheckinBanner form={dueForm} locale={locale} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="lg:col-start-1 lg:row-start-1">
          <WeightCard locale={locale} points={weightPoints} />
        </div>
        <div className="lg:col-start-2 lg:row-start-1">
          <StatTiles
            locale={locale}
            streak={checkinStreak(history, today)}
            workoutsDone={stats.total}
            adherence={adherenceAverage(history)}
          />
        </div>
        <div className="lg:col-start-1 lg:row-start-2">
          <TodaySection
            locale={locale}
            plan={plan}
            workoutState={workoutState}
            sessions={sessionRows}
            loggedActivityIds={activityLogs.map((l) => l.program_activity_id)}
            nutrition={nutrition}
          />
        </div>
        {clientRow?.coaches && (
          <div className="lg:col-start-2 lg:row-start-2">
            <CoachRow businessName={clientRow.coaches.business_name} hasInvoices={!!invoiceCount} />
          </div>
        )}
      </div>
    </div>
  );
}
