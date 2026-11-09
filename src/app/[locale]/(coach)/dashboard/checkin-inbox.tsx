import { getTranslations } from "next-intl/server";
import { Inbox } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatRelativeTime } from "@/lib/format";
import { CoachHomeService, type InboxFilter } from "@/domain/dashboard/coach-home.service";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { ClientAvatar } from "./client-avatar";

const INBOX_LIMIT = 6;

export async function CheckinInbox({ locale, filter }: { locale: AppLocale; filter: InboxFilter }) {
  const t = await getTranslations("dashboard.inbox");
  const supabase = await createClient();
  const rows = await new CoachHomeService(supabase).listInbox(filter, INBOX_LIMIT);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title={t(`empty.${filter}`)}
        action={
          filter !== "all" && (
            <Link href="/dashboard" className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("showAll")}
            </Link>
          )
        }
      />
    );
  }

  return (
    <>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-5 py-3.5"
          >
            <ClientAvatar id={row.clientId} name={row.clientName} />
            <div className="flex min-w-0 flex-[1_1_11rem] flex-col">
              <span className="truncate font-medium">{row.clientName}</span>
              <span className="truncate text-muted-foreground">
                {row.template ? pickLocale(row.template, locale) : "—"}
              </span>
            </div>
            <span className="font-mono text-sm text-muted-foreground tabular-nums">
              {formatRelativeTime(row.submittedAt, locale)}
            </span>
            {row.reviewed ? (
              <StatusBadge tone="success">{t("status.reviewed")}</StatusBadge>
            ) : (
              <StatusBadge tone="accent">{t("status.new")}</StatusBadge>
            )}
            <Link
              href="/review"
              className={buttonVariants({ variant: "outline", size: "xs" })}
              aria-label={t("reviewLabel", { name: row.clientName })}
            >
              {t("review")}
            </Link>
          </li>
        ))}
      </ul>
      <div className="px-5 py-3.5">
        <Link href="/forms/submissions" className="font-medium text-primary hover:underline">
          {t("viewAll")}
        </Link>
      </div>
    </>
  );
}
