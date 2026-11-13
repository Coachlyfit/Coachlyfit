"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/status-badge";
import { Link } from "@/i18n/navigation";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import type { TemplateOverview } from "@/domain/forms/templates.service";
import { archiveTemplateAction, duplicateTemplateAction } from "./actions";
import { AssignDialog } from "./assign-dialog";
import { kindMeta } from "@/components/forms-runtime/kind-meta";

export type FormRow = TemplateOverview & { name: string };
export type ClientOption = { id: string; display_name: string };

function Stat({
  value,
  label,
  locale,
  highlight = false,
}: {
  value: number;
  label: string;
  locale: AppLocale;
  highlight?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex flex-col rounded-[10px] px-2.5 py-2 leading-tight",
        highlight ? "bg-accent-tint text-accent-tint-foreground" : "bg-muted/60"
      )}
    >
      <span className="font-mono text-lg font-semibold tabular-nums">{formatNumber(value, locale)}</span>
      <span className={cn(!highlight && "text-muted-foreground")}>{label}</span>
    </span>
  );
}

export function FormCard({
  locale,
  row,
  clients,
  canDuplicate,
}: {
  locale: AppLocale;
  row: FormRow;
  clients: ClientOption[];
  /** A duplicate is a new form, so it needs the forms builder on the plan. */
  canDuplicate: boolean;
}) {
  const t = useTranslations("forms.list");
  const tKinds = useTranslations("forms.kinds");
  const tErrors = useTranslations("forms.errors");
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const meta = kindMeta(row.kind);
  const Icon = meta.icon;
  const published = row.currentVersionId != null;

  function run(action: () => Promise<{ error: string } | void>, done: string) {
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      setConfirmDelete(false);
      toast.success(done);
    });
  }

  return (
    <article
      className={cn(
        "flex flex-col gap-3.5 rounded-xl bg-card p-4.5 ring-1 ring-foreground/10 transition-opacity",
        pending && "opacity-70"
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", meta.tint)}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col leading-snug">
          <Link href={`/forms/${row.id}`} className="truncate text-base font-semibold hover:underline">
            {row.name}
          </Link>
          <span className="text-muted-foreground">{tKinds(row.kind)}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {published ? (
            <StatusBadge tone="success">{t("status.published")}</StatusBadge>
          ) : (
            <Badge className="rounded-md bg-muted text-foreground">{t("status.draft")}</Badge>
          )}
          {published && row.hasDraft && <StatusBadge tone="warning">{t("status.unpublishedChanges")}</StatusBadge>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat value={row.questions} label={t("stats.questions", { count: row.questions })} locale={locale} />
        <Stat value={row.clients} label={t("stats.clients", { count: row.clients })} locale={locale} />
        {/* Always a link: with 0 new responses it still opens the form's full answer history. */}
        <Link
          href={`/forms/submissions?form=${row.id}`}
          className="rounded-[10px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Stat
            value={row.newResponses}
            label={t("stats.newResponses", { count: row.newResponses })}
            locale={locale}
            highlight={row.newResponses > 0}
          />
        </Link>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <span className="min-w-0 flex-1 text-muted-foreground">
          {t.rich("updated", {
            date: formatDate(row.updated_at, locale),
            num: (chunks) => <span className="font-mono tabular-nums">{chunks}</span>,
          })}
        </span>
        <Link href={`/forms/${row.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
          {t("actions.edit")}
        </Link>
        <AssignDialog
          locale={locale}
          templateVersionId={row.currentVersionId}
          clients={clients}
          trigger={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!published}
              title={published ? undefined : t("assignNeedsPublish")}
            />
          }
        >
          {t("actions.assign")}
        </AssignDialog>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t("actions.more", { name: row.name })} />
            }
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canDuplicate && (
              <DropdownMenuItem onClick={() => run(() => duplicateTemplateAction(locale, row.id), t("duplicated"))}>
                <Copy className="size-4" />
                {t("actions.duplicate")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" />
              {t("actions.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("deleteTitle", { name: row.name })}
        description={t(row.clients > 0 ? "deleteBodyAssigned" : "deleteBody")}
        confirmLabel={t("actions.delete")}
        onConfirm={() => run(() => archiveTemplateAction(locale, row.id), t("deleted"))}
        pending={pending}
      />
    </article>
  );
}
