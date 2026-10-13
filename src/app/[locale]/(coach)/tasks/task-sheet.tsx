"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatRelativeTime } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { addTaskCommentAction, deleteTaskAction, listTaskCommentsAction, type TaskComment } from "./actions";
import type { TaskRow } from "./tasks-view";

/** Task detail drawer. Mounted per task (keyed by id), so comments load once
 * on mount rather than with the list. */
export function TaskSheet({
  locale,
  task,
  isOwner,
  overdue,
  nameOf,
  statusControl,
  priorityBadge,
  onEdit,
  onClose,
}: {
  locale: AppLocale;
  task: TaskRow;
  isOwner: boolean;
  overdue: boolean;
  nameOf: (profileId: string | null) => string;
  statusControl: React.ReactNode;
  priorityBadge: React.ReactNode;
  onEdit: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("tasks.detail");
  const tTasks = useTranslations("tasks");
  const tErrors = useTranslations("tasks.errors");
  const tCommon = useTranslations("common");
  const [comments, setComments] = useState<TaskComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    listTaskCommentsAction(task.id).then((rows) => {
      if (active) setComments(rows);
    });
    return () => {
      active = false;
    };
  }, [task.id]);

  const fail = (code: string) => toast.error(tErrors.has(code) ? tErrors(code) : tErrors("unknown"));

  function addComment() {
    const body = draft.trim();
    if (!body) return;
    startTransition(async () => {
      const result = await addTaskCommentAction(task.id, body);
      if (result?.error) return void fail(result.error);
      setDraft("");
      setComments(await listTaskCommentsAction(task.id));
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteTaskAction(locale, task.id);
      setConfirmDelete(false);
      if (result?.error) return void fail(result.error);
      toast.success(tTasks("toast.deleted"));
      onClose();
    });
  }

  const facts: [string, React.ReactNode][] = [
    [tTasks("table.status"), statusControl],
    [tTasks("table.priority"), priorityBadge],
    [tTasks("table.assignee"), nameOf(task.assigneeId)],
    [
      tTasks("table.due"),
      task.dueDate ? (
        <span className={overdue ? "font-medium text-destructive-tint-foreground" : undefined}>
          {formatDate(task.dueDate, locale)}
          {overdue && ` · ${tTasks("overdue")}`}
        </span>
      ) : (
        "—"
      ),
    ],
  ];
  if (task.clientName) facts.push([tTasks("table.client"), task.clientName]);

  return (
    <>
      <Sheet open onOpenChange={(next) => !next && onClose()}>
        <SheetContent side="bottom" className="h-auto max-h-[85dvh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="text-start">{task.title}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-4">
            {task.description && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{task.description}</p>}

            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-sm">
              {facts.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="min-w-0">{value}</dd>
                </div>
              ))}
            </dl>

            {isOwner && (
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onEdit}>
                  <Pencil className="size-4" />
                  {t("edit")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="size-4" />
                  {t("delete")}
                </Button>
              </div>
            )}

            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">{t("comments")}</h3>
              {comments === null ? (
                <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>
              ) : comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noComments")}</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {comments.map((comment) => (
                    <li key={comment.id} className="rounded-md border border-border px-3 py-2.5">
                      <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{nameOf(comment.authorId)}</span>
                        <span>{formatRelativeTime(comment.createdAt, locale)}</span>
                      </p>
                      <p className="mt-1 text-sm whitespace-pre-wrap">{comment.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-col gap-2">
                <Textarea
                  rows={2}
                  maxLength={2000}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={t("commentPlaceholder")}
                  aria-label={t("commentPlaceholder")}
                />
                <Button
                  type="button"
                  size="sm"
                  className="w-fit min-w-24"
                  disabled={pending || !draft.trim()}
                  onClick={addComment}
                >
                  {t("addComment")}
                </Button>
              </div>
            </section>
          </div>
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("confirmDeleteTitle")}
        description={t("confirmDeleteBody")}
        confirmLabel={t("delete")}
        onConfirm={remove}
        pending={pending}
      />
    </>
  );
}
