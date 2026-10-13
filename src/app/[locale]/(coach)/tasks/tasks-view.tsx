"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { BarChart3, Columns3, List, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import {
  DUE_FILTERS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  isOverdue,
  matchesFilters,
  type TaskFilters,
  type TaskStatus,
  type TaskView,
} from "@/domain/tasks/tasks";
import { setTaskStatusAction } from "./actions";
import { TaskDialog } from "./task-dialog";
import { TaskSheet } from "./task-sheet";

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  /** "YYYY-MM-DD" */
  dueDate: string | null;
  assigneeId: string | null;
  clientId: string | null;
  clientName: string | null;
  createdAt: string;
};

export type Person = { id: string; name: string; isOwner: boolean };

// low has no tone: nothing to act on, so it stays neutral.
const PRIORITY_TONE: Partial<Record<string, StatusTone>> = { high: "destructive", medium: "warning" };

export function TasksView({
  locale,
  tasks,
  directory,
  clients,
  filters,
  view,
  isOwner,
  today,
}: {
  locale: AppLocale;
  tasks: TaskRow[];
  directory: Person[];
  clients: { id: string; display_name: string }[];
  filters: TaskFilters;
  view: TaskView;
  isOwner: boolean;
  /** "YYYY-MM-DD", from the server so both renders agree on what is overdue. */
  today: string;
}) {
  const t = useTranslations("tasks");
  const tErrors = useTranslations("tasks.errors");
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  // The URL is the source of truth (a filtered view is linkable); the state
  // here is optimistic so a filter switches on click -- same idiom as
  // finance-view.tsx.
  const [state, setState] = useOptimistic({ filters, view });
  const [rows, moveOptimistic] = useOptimistic(tasks, (current, change: { id: string; status: TaskStatus }) =>
    current.map((task) => (task.id === change.id ? { ...task, status: change.status } : task))
  );
  const [openId, setOpenId] = useState<string | null>(null);
  // null = closed; { task: null } = creating.
  const [dialog, setDialog] = useState<{ task: TaskRow | null } | null>(null);

  function go(next: Partial<TaskFilters> & { view?: TaskView }) {
    const { view: nextView = state.view, ...patch } = next;
    const nextFilters = { ...state.filters, ...patch };
    const params = new URLSearchParams();
    for (const key of ["status", "priority", "assignee", "due"] as const) {
      if (nextFilters[key] !== "all") params.set(key, nextFilters[key]);
    }
    if (nextView !== "list") params.set("view", nextView);
    const query = params.toString();
    startTransition(() => {
      setState({ filters: nextFilters, view: nextView });
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  function changeStatus(task: TaskRow, status: string) {
    if (status === task.status) return;
    startTransition(async () => {
      moveOptimistic({ id: task.id, status: status as TaskStatus });
      const result = await setTaskStatusAction(locale, task.id, status);
      if (result?.error) toast.error(tErrors.has(result.error) ? tErrors(result.error) : tErrors("unknown"));
    });
  }

  const names = new Map(directory.map((person) => [person.id, person.name]));
  // An id that is no longer in the directory is a removed member's finished task.
  const nameOf = (profileId: string | null) =>
    profileId === null ? t("unassigned") : (names.get(profileId) ?? t("formerMember"));

  const shown = rows.filter((task) => matchesFilters(task, state.filters, today));
  const filtered = Object.values(state.filters).some((value) => value !== "all");
  const open = openId ? rows.find((task) => task.id === openId) : undefined;

  const statusOptions = TASK_STATUSES.map((value) => ({ value, label: t(`status.${value}`) }));
  const all = { value: "all", label: t("toolbar.all") };

  const statusControl = (task: TaskRow) => (
    <Select value={task.status} onValueChange={(value) => changeStatus(task, value as string)} items={statusOptions}>
      <SelectTrigger size="sm" aria-label={t("table.status")} className="w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {statusOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const priorityBadge = (task: TaskRow) => {
    const tone = PRIORITY_TONE[task.priority];
    const label = t(`priority.${task.priority}`);
    return tone ? (
      <StatusBadge tone={tone}>{label}</StatusBadge>
    ) : (
      <Badge variant="secondary" className="rounded-md">
        {label}
      </Badge>
    );
  };

  const dueCell = (task: TaskRow) =>
    task.dueDate ? (
      <span
        className={cn(
          "font-mono text-[0.8125rem] tabular-nums",
          isOverdue(task, today) && "font-semibold text-destructive-tint-foreground"
        )}
      >
        {formatDate(task.dueDate, locale)}
        {isOverdue(task, today) && <span className="ms-1.5 font-sans">· {t("overdue")}</span>}
      </span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );

  const filter = (
    key: keyof TaskFilters,
    label: string,
    options: { value: string; label: string }[],
    className = "w-36"
  ) => (
    <Select value={state.filters[key]} onValueChange={(value) => go({ [key]: value as string } as Partial<TaskFilters>)} items={options}>
      <SelectTrigger size="sm" aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl leading-9 font-semibold">{isOwner ? t("title") : t("myTitle")}</h1>
        {isOwner && (
          <div className="flex flex-wrap gap-2">
            <Link href="/tasks/productivity" className={buttonVariants({ variant: "outline" })}>
              <BarChart3 className="size-4" />
              {t("productivity.title")}
            </Link>
            <Button type="button" onClick={() => setDialog({ task: null })}>
              <Plus className="size-4" />
              {t("new")}
            </Button>
          </div>
        )}
      </header>

      {tasks.length === 0 ? (
        <Card>
          <EmptyState
            brandMark
            title={t("emptyTitle")}
            description={isOwner ? t("empty") : t("emptyMember")}
            action={
              isOwner ? (
                <Button type="button" onClick={() => setDialog({ task: null })}>
                  <Plus className="size-4" />
                  {t("new")}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {/* The board's columns are the statuses, so the status filter would only empty them. */}
            {state.view === "list" && filter("status", t("toolbar.status"), [all, ...statusOptions])}
            {isOwner &&
              filter(
                "assignee",
                t("toolbar.assignee"),
                [
                  { value: "all", label: t("toolbar.allAssignees") },
                  { value: "none", label: t("unassigned") },
                  ...directory.map((person) => ({ value: person.id, label: person.name })),
                ],
                "w-44"
              )}
            {filter("priority", t("toolbar.priority"), [
              { value: "all", label: t("toolbar.allPriorities") },
              ...TASK_PRIORITIES.map((value) => ({ value, label: t(`priority.${value}`) })),
            ])}
            {filter(
              "due",
              t("toolbar.due"),
              DUE_FILTERS.map((value) => ({ value, label: t(`toolbar.due_${value}`) })),
              "w-40"
            )}
            <Segmented
              className="ms-auto"
              label={t("toolbar.view")}
              value={state.view}
              onChange={(next) => go({ view: next, ...(next === "board" ? { status: "all" as const } : {}) })}
              options={[
                { value: "list", label: t("toolbar.viewList"), icon: List },
                { value: "board", label: t("toolbar.viewBoard"), icon: Columns3 },
              ]}
            />
          </div>

          {shown.length === 0 ? (
            <Card>
              <EmptyState
                title={t("noResults")}
                description={t("noResultsHint")}
                action={
                  filtered ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => go({ status: "all", priority: "all", assignee: "all", due: "all" })}
                    >
                      {t("toolbar.clear")}
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : state.view === "board" ? (
            <KanbanBoard
              columns={statusOptions.map((option) => ({ key: option.value, label: option.label }))}
              items={shown}
              getGroup={(task) => task.status}
              isDraggable={() => true}
              onMove={changeStatus}
              emptyLabel={t("boardEmpty")}
              renderCard={(task) => (
                <button
                  type="button"
                  onClick={() => setOpenId(task.id)}
                  className="flex w-full flex-col gap-2 rounded-md bg-card p-3 text-start ring-1 ring-foreground/10"
                >
                  <span className="text-sm font-medium">{task.title}</span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {priorityBadge(task)}
                    {task.dueDate && dueCell(task)}
                  </span>
                  {isOwner && <span className="truncate text-xs text-muted-foreground">{nameOf(task.assigneeId)}</span>}
                </button>
              )}
            />
          ) : (
            <Card className="gap-0 overflow-hidden py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("table.title")}</TableHead>
                    {isOwner && <TableHead>{t("table.assignee")}</TableHead>}
                    <TableHead>{t("table.priority")}</TableHead>
                    <TableHead>{t("table.due")}</TableHead>
                    <TableHead>{t("table.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="max-w-80">
                        <button
                          type="button"
                          onClick={() => setOpenId(task.id)}
                          className="flex min-h-11 w-full flex-col justify-center text-start underline-offset-4 hover:underline md:min-h-0"
                        >
                          <span
                            className={cn(
                              "truncate font-medium",
                              task.status === "cancelled" && "text-muted-foreground line-through"
                            )}
                          >
                            {task.title}
                          </span>
                          {task.clientName && (
                            <span className="truncate text-xs text-muted-foreground">{task.clientName}</span>
                          )}
                        </button>
                      </TableCell>
                      {isOwner && <TableCell>{nameOf(task.assigneeId)}</TableCell>}
                      <TableCell>{priorityBadge(task)}</TableCell>
                      <TableCell>{dueCell(task)}</TableCell>
                      <TableCell>{statusControl(task)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}

      {open && (
        <TaskSheet
          key={open.id}
          locale={locale}
          task={open}
          isOwner={isOwner}
          overdue={isOverdue(open, today)}
          nameOf={nameOf}
          statusControl={statusControl(open)}
          priorityBadge={priorityBadge(open)}
          onEdit={() => {
            setOpenId(null);
            setDialog({ task: open });
          }}
          onClose={() => setOpenId(null)}
        />
      )}
      {dialog && (
        <TaskDialog
          key={dialog.task?.id ?? "new"}
          locale={locale}
          task={dialog.task}
          directory={directory}
          clients={clients}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
