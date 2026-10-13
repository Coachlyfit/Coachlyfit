"use client";

import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDatePicker } from "@/components/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TASK_PRIORITIES, type TaskPriority } from "@/domain/tasks/tasks";
import { createTaskAction, updateTaskAction } from "./actions";
import { taskSchema, type TaskFormInput } from "./schemas";
import type { Person, TaskRow } from "./tasks-view";

// The base-ui Select has no empty value; "" is what the form and schema use.
const NONE = "__none__";

/** Create (task = null) or edit. Owner only: the page never renders it for a
 * team member, and the database refuses their insert or edit regardless. */
export function TaskDialog({
  locale,
  task,
  directory,
  clients,
  onClose,
}: {
  locale: string;
  task: TaskRow | null;
  directory: Person[];
  clients: { id: string; display_name: string }[];
  onClose: () => void;
}) {
  const t = useTranslations("tasks.dialog");
  const tTasks = useTranslations("tasks");
  const tErrors = useTranslations("tasks.errors");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<TaskFormInput>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: task?.title ?? "",
      description: task?.description ?? "",
      priority: (task?.priority as TaskPriority | undefined) ?? "medium",
      due_date: task?.dueDate ?? "",
      // A former member can't be assigned again, so an edit starts unassigned.
      assignee_id: directory.some((person) => person.id === task?.assigneeId) ? (task?.assigneeId ?? "") : "",
      client_id: task?.clientId ?? "",
    },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    startTransition(async () => {
      const result = task ? await updateTaskAction(locale, task.id, data) : await createTaskAction(locale, data);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      toast.success(tTasks(task ? "toast.updated" : "toast.created"));
      onClose();
    });
  });

  const people = [
    { value: NONE, label: tTasks("unassigned") },
    ...directory.map((person) => ({ value: person.id, label: person.name })),
  ];
  const clientOptions = [
    { value: NONE, label: t("noClient") },
    ...clients.map((client) => ({ value: client.id, label: client.display_name })),
  ];
  const priorities = TASK_PRIORITIES.map((value) => ({ value, label: tTasks(`priority.${value}`) }));

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? t("editTitle") : t("createTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="task_title">{t("titleLabel")}</Label>
            <Input id="task_title" maxLength={200} aria-invalid={!!errors.title} {...register("title")} />
            {errors.title && <p className="text-sm text-destructive">{t("titleRequired")}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="task_description">{t("descriptionLabel")}</Label>
            <Textarea id="task_description" rows={3} maxLength={5000} {...register("description")} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="task_assignee">{t("assigneeLabel")}</Label>
              <Controller
                name="assignee_id"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value || NONE}
                    onValueChange={(value) => field.onChange(value === NONE ? "" : value)}
                    items={people}
                  >
                    <SelectTrigger id="task_assignee" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {people.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="task_priority">{t("priorityLabel")}</Label>
              <Controller
                name="priority"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} items={priorities}>
                    <SelectTrigger id="task_priority" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {priorities.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="task_due">{t("dueLabel")}</Label>
              <FormDatePicker id="task_due" control={control} name="due_date" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="task_client">{t("clientLabel")}</Label>
              <Controller
                name="client_id"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value || NONE}
                    onValueChange={(value) => field.onChange(value === NONE ? "" : value)}
                    items={clientOptions}
                  >
                    <SelectTrigger id="task_client" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {clientOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {tErrors.has(formError) ? tErrors(formError) : tErrors("unknown")}
            </p>
          )}
          <Button type="submit" disabled={pending} className="min-w-24">
            {pending ? tCommon("pending") : task ? tCommon("save") : t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
