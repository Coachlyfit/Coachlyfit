"use client";

import { Check, ChevronLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams, useSelectedLayoutSegment } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { kindMeta } from "@/components/forms-runtime/kind-meta";
import type { AppLocale } from "@/domain/locale";
import type { DueStatus, TimeEstimate } from "@/domain/forms/client-list";

export type TodoItem = {
  id: string;
  name: string;
  kind: string;
  questionCount: number;
  time: TimeEstimate;
  due: DueStatus;
  /** 0..1 when a draft exists, otherwise null. */
  draftPct: number | null;
  /** Last 7 days, oldest first; null unless the form behaves like a daily one. */
  streak: boolean[] | null;
};

export type SentItem = {
  id: string;
  name: string;
  kind: string;
  submittedAt: string;
  reviewed: boolean;
};

type Tab = "todo" | "sent";

const mono = (chunks: React.ReactNode) => <span className="font-mono tabular-nums">{chunks}</span>;

export function FormsListPanel({
  coachName,
  todo,
  sent,
}: {
  coachName: string;
  todo: TodoItem[];
  sent: SentItem[];
}) {
  const t = useTranslations("forms.clientList");
  const searchParams = useSearchParams();
  const selectedId = useSelectedLayoutSegment();
  const tab: Tab = searchParams.get("tab") === "sent" ? "sent" : "todo";
  const query = tab === "sent" ? "?tab=sent" : "";

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "todo", label: t("tabTodo"), count: todo.length },
    { id: "sent", label: t("tabSent"), count: sent.length },
  ];

  const [featured, ...rest] = todo;

  return (
    // On mobile the list and an open form are separate screens; on lg they sit side by side.
    <section aria-labelledby="forms-list-h" className={cn("flex min-w-0 flex-col gap-3", selectedId && "max-lg:hidden")}>
      <header className="flex flex-col">
        <h1 id="forms-list-h" className="text-2xl font-bold tracking-tight">
          {t("title")}
        </h1>
        {coachName && (
          <p className="text-sm text-muted-foreground">
            {t("fromCoach", { coach: coachName })}
          </p>
        )}
      </header>

      <div role="tablist" aria-label={t("tabsLabel")} className="flex gap-1 rounded-xl bg-muted p-1">
        {tabs.map((item) => (
          <Link
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            href={item.id === "sent" ? "/c/forms?tab=sent" : "/c/forms"}
            replace
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors",
              tab === item.id ? "bg-background shadow-sm" : "text-muted-foreground"
            )}
          >
            {item.label}
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{item.count}</span>
          </Link>
        ))}
      </div>

      {tab === "todo" ? (
        todo.length === 0 ? (
          <EmptyState text={t("emptyTodo")} />
        ) : (
          <ul role="tabpanel" aria-label={tabs.find((x) => x.id === tab)?.label} className="flex flex-col gap-3">
            <li>
              <FeaturedCard item={featured} href={`/c/forms/${featured.id}${query}`} selected={selectedId === featured.id} />
            </li>
            {rest.map((item) => (
              <li key={item.id}>
                <TodoRow item={item} href={`/c/forms/${item.id}${query}`} selected={selectedId === item.id} />
              </li>
            ))}
          </ul>
        )
      ) : sent.length === 0 ? (
        <EmptyState text={t("emptySent")} />
      ) : (
        <ul role="tabpanel" aria-label={tabs.find((x) => x.id === tab)?.label} className="flex flex-col gap-3">
          {sent.map((item) => (
            <li key={item.id}>
              <SentRow item={item} href={`/c/forms/${item.id}${query}`} selected={selectedId === item.id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function DueBadge({ due, className }: { due: DueStatus; className?: string }) {
  const t = useTranslations("forms.clientList");
  if (due.kind === "none") return null;
  const base = "shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium";
  if (due.kind === "overdue") {
    return (
      <span className={cn(base, "bg-destructive-tint text-destructive-tint-foreground", className)}>
        {t.rich("overdue", { days: due.days, n: mono })}
      </span>
    );
  }
  if (due.kind === "today") {
    return <span className={cn(base, "bg-warning-tint text-warning-tint-foreground", className)}>{t("today")}</span>;
  }
  return (
    <span className={cn(base, "bg-muted text-foreground", className)}>{t.rich("dueIn", { days: due.days, n: mono })}</span>
  );
}

function Meta({ item }: { item: Pick<TodoItem, "questionCount" | "time"> }) {
  const t = useTranslations("forms.clientList");
  return (
    <>
      {t.rich("questions", { count: item.questionCount, n: mono })}
      {" · "}
      {item.time.kind === "underMinute" ? t("timeUnderMinute") : t.rich("timeMinutes", { minutes: item.time.minutes, n: mono })}
    </>
  );
}

function FeaturedCard({ item, href, selected }: { item: TodoItem; href: string; selected: boolean }) {
  const t = useTranslations("forms.clientList");
  const doneDays = item.streak?.filter(Boolean).length ?? 0;
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex flex-col gap-3 rounded-2xl bg-foreground p-4 text-background",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      <span className="flex items-center justify-between gap-2">
        {item.due.kind === "none" ? <span /> : <DueBadge due={item.due} />}
        <span className="text-sm opacity-80">
          <Meta item={item} />
        </span>
      </span>
      <span className="text-xl font-bold leading-snug">{item.name}</span>
      {item.draftPct !== null && <DraftBar pct={item.draftPct} inverted />}
      <span className="flex items-center justify-between gap-3">
        {item.streak ? (
          <span role="img" aria-label={t("streakLabel", { done: doneDays })} className="flex gap-1">
            {item.streak.map((on, i) => (
              <span key={i} className={cn("size-4.5 rounded-md", on ? "bg-success" : "bg-background/25")} />
            ))}
          </span>
        ) : (
          <span />
        )}
        <span className="flex h-11 items-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground">
          {item.draftPct !== null ? t("resume") : t("start")}
        </span>
      </span>
    </Link>
  );
}

function KindTile({ kind, className }: { kind: string; className?: string }) {
  const { icon: Icon, tint } = kindMeta(kind);
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-xl", tint, className)} aria-hidden="true">
      <Icon className="size-5" />
    </span>
  );
}

function DraftBar({ pct, inverted }: { pct: number; inverted?: boolean }) {
  const t = useTranslations("forms.clientList");
  return (
    <span className="flex items-center gap-2">
      <span className={cn("h-1.5 flex-1 overflow-hidden rounded-full", inverted ? "bg-background/25" : "bg-muted")}>
        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(pct * 100)}%` }} />
      </span>
      <span className={cn("text-xs", inverted ? "opacity-80" : "text-muted-foreground")}>{t("draftInProgress")}</span>
    </span>
  );
}

function TodoRow({ item, href, selected }: { item: TodoItem; href: string; selected: boolean }) {
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card p-3.5 transition-colors hover:bg-muted/50",
        selected && "border-primary ring-1 ring-primary"
      )}
    >
      <KindTile kind={item.kind} className="size-11" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-semibold">{item.name}</span>
        <span className="text-sm text-muted-foreground">
          <Meta item={item} />
        </span>
        {item.draftPct !== null && <DraftBar pct={item.draftPct} />}
      </span>
      <DueBadge due={item.due} />
    </Link>
  );
}

function SentRow({ item, href, selected }: { item: SentItem; href: string; selected: boolean }) {
  const t = useTranslations("forms.clientList");
  const locale = useLocale() as AppLocale;
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex min-h-16 flex-col gap-2 rounded-2xl border border-border bg-card p-3.5 transition-colors hover:bg-muted/50",
        selected && "border-primary ring-1 ring-primary"
      )}
    >
      <span className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-tint text-success-tint-foreground" aria-hidden="true">
          <Check className="size-4.5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">{item.name}</span>
          <span className="text-sm text-muted-foreground">
            {t("sentOn", {
              date: formatDate(item.submittedAt, locale, { day: "numeric", month: "short", year: "numeric" }),
            })}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary">
          {t("view")}
          <ChevronLeft className="size-4 ltr:rotate-180" aria-hidden="true" />
        </span>
      </span>
      {item.reviewed && (
        <span className="w-fit rounded-md bg-success-tint px-2 py-0.5 text-xs font-medium text-success-tint-foreground">
          {t("reviewed")}
        </span>
      )}
    </Link>
  );
}
