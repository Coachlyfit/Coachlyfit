import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, getRequestCoachId } from "@/lib/auth/session";
import { getFeatures } from "@/lib/features";
import { PageTitle } from "@/components/dashboard/page-title";
import { UpgradePrompt } from "@/components/dashboard/upgrade-prompt";
import { TasksService } from "@/domain/tasks/tasks.service";
import {
  DUE_FILTERS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_VIEWS,
  oneOf,
  type TaskFilters,
} from "@/domain/tasks/tasks";
import type { AppLocale } from "@/domain/locale";
import { TasksView, type TaskRow } from "./tasks-view";

// One route for both sides. The owner sees every task in the tenant and
// manages them; a team member gets "My tasks" -- the same page over the rows
// RLS leaves them (assigned to them), with status and comments only.
export default async function TasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ status?: string; priority?: string; assignee?: string; due?: string; view?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations("tasks");

  const [user, coachId, features] = await Promise.all([getAuthUser(), getRequestCoachId(), getFeatures()]);
  if (!user || !coachId) notFound();
  const isOwner = user.id === coachId;

  // The nav item is hidden on these plans; this is the direct-URL case. The
  // database returns no tasks either way.
  if (!features.task_management) {
    return (
      <div className="flex flex-col gap-5">
        <PageTitle title={t("title")} />
        <Card>
          <CardContent>
            <UpgradePrompt feature="task_management" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const service = new TasksService(supabase);
  const [tasks, directory, { data: clients }] = await Promise.all([
    service.list(),
    service.directory(),
    // Only the owner creates or edits, so only they need the client picker.
    isOwner
      ? supabase.from("clients").select("id, display_name").neq("status", "archived").order("display_name")
      : Promise.resolve({ data: [] }),
  ]);

  const rows: TaskRow[] = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.due_date,
    assigneeId: task.assignee_id,
    clientId: task.client_id,
    clientName: task.clients?.display_name ?? null,
    createdAt: task.created_at,
  }));

  // Unknown values from a hand-edited URL fall back to "all", not an error.
  const filters: TaskFilters = {
    status: oneOf(["all", ...TASK_STATUSES], query.status, "all"),
    priority: oneOf(["all", ...TASK_PRIORITIES], query.priority, "all"),
    assignee: oneOf(["all", "none", ...directory.map((person) => person.id)], query.assignee, "all"),
    due: oneOf(DUE_FILTERS, query.due, "all"),
  };

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={isOwner ? t("title") : t("myTitle")} />
      <TasksView
        locale={locale}
        tasks={rows}
        directory={directory}
        clients={clients ?? []}
        filters={filters}
        view={oneOf(TASK_VIEWS, query.view, "list")}
        isOwner={isOwner}
        // UTC day, same as the other date defaults in the app.
        today={new Date().toISOString().slice(0, 10)}
      />
    </div>
  );
}
