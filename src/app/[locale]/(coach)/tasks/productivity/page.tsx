import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, getRequestCoachId } from "@/lib/auth/session";
import { getFeatures } from "@/lib/features";
import { PageTitle } from "@/components/dashboard/page-title";
import { TasksService } from "@/domain/tasks/tasks.service";
import { oneOf } from "@/domain/tasks/tasks";
import { NO_COUNTS, PRODUCTIVITY_RANGES, resolveRange } from "@/domain/tasks/productivity";
import type { AppLocale } from "@/domain/locale";
import { ProductivityView } from "./productivity-view";

// Owner only. A team member is sent back to their tasks; the numbers are
// also out of their reach in the database, where task_productivity() runs
// under their own tasks policies.
export default async function ProductivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string; member?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations("tasks.productivity");

  const [user, coachId, features] = await Promise.all([getAuthUser(), getRequestCoachId(), getFeatures()]);
  if (!user || !coachId) notFound();
  // /tasks explains the plan; it has the upgrade prompt.
  if (user.id !== coachId || !features.task_management) redirect(`/${locale}/tasks`);

  // UTC day, same as the tasks page.
  const today = new Date().toISOString().slice(0, 10);
  const period = resolveRange(oneOf(PRODUCTIVITY_RANGES, query.range, "30d"), today, query.from, query.to);

  const service = new TasksService(await createClient());
  const [directory, counts] = await Promise.all([service.directory(), service.productivity(period.from, period.to)]);

  // Everyone currently on the team gets a row, zeros included: "nothing
  // assigned" is information too. A removed member's old tasks are left out.
  const byAssignee = new Map(counts.map((row) => [row.assigneeId, row]));
  const members = directory.map((person) => ({
    id: person.id,
    name: person.name,
    counts: byAssignee.get(person.id) ?? NO_COUNTS,
  }));

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={t("title")} />
      <Link
        href="/tasks"
        className="flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <ArrowRight className="size-4 rotate-180 rtl:rotate-0" aria-hidden="true" />
        {t("back")}
      </Link>
      <ProductivityView
        locale={locale}
        members={members}
        range={period.range}
        from={period.from}
        to={period.to}
        memberId={members.some((member) => member.id === query.member) ? (query.member ?? null) : null}
      />
    </div>
  );
}
