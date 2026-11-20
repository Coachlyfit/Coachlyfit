import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/dashboard/page-title";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CoachingApplicationsService } from "@/domain/coaching-applications/coaching-applications.service";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/domain/coaching-applications/schema";
import type { AppLocale } from "@/domain/locale";
import { Link } from "@/i18n/navigation";
import { getRequestCoachId } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { STATUS_TONE } from "./status-tone";

export default async function ApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status: raw } = await searchParams;
  const t = await getTranslations("applications");

  // Unknown values from a hand-edited URL fall back to "all".
  const status = APPLICATION_STATUSES.find((s) => s === raw);
  const coachId = await getRequestCoachId();
  const rows = coachId ? await new CoachingApplicationsService(await createClient()).list(coachId, status) : [];

  const filters: Array<{ key: ApplicationStatus | "all"; href: string }> = [
    { key: "all", href: "/applications" },
    ...APPLICATION_STATUSES.map((s) => ({ key: s, href: `/applications?status=${s}` })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={t("title")} />
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl leading-9 font-semibold">{t("heading")}</h1>
        <p className="text-base text-muted-foreground">{t("subtitle")}</p>
      </header>

      <nav aria-label={t("filters.label")} className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={f.href}
            aria-current={(status ?? "all") === f.key ? "page" : undefined}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm",
              (status ?? "all") === f.key ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {f.key === "all" ? t("filters.all") : t(`status.${f.key}`)}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <Card>
          <EmptyState title={t("empty.title")} description={status ? t("empty.filtered") : t("empty.description")} />
        </Card>
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("fields.name")}</TableHead>
                <TableHead>{t("fields.email")}</TableHead>
                <TableHead>{t("fields.goal")}</TableHead>
                <TableHead>{t("table.submitted")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <Link href={`/applications/${r.id}`} className="hover:underline">
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell dir="ltr" className="text-start">
                    {r.email}
                  </TableCell>
                  <TableCell>{t(`goals.${r.goal as "other"}`)}</TableCell>
                  <TableCell>{formatDate(r.created_at, locale, { dateStyle: "medium" })}</TableCell>
                  <TableCell>
                    <StatusBadge tone={STATUS_TONE[r.status as ApplicationStatus]}>{t(`status.${r.status as ApplicationStatus}`)}</StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
