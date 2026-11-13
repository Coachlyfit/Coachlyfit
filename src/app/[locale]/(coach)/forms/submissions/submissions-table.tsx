import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import type { SubmissionsService } from "@/domain/forms/submissions.service";

type Rows = Awaited<ReturnType<SubmissionsService["listWithContext"]>>;

/** Shared by the all-submissions page and the per-client Forms tab. The client
 * column is dropped when the list is already scoped to one client. */
export async function SubmissionsTable({
  rows,
  locale,
  showClient = true,
}: {
  rows: Rows;
  locale: AppLocale;
  showClient?: boolean;
}) {
  const t = await getTranslations("forms.submissions");

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            {showClient && <TableHead>{t("table.client")}</TableHead>}
            <TableHead>{t("table.form")}</TableHead>
            <TableHead>{t("table.submittedAt")}</TableHead>
            <TableHead>{t("table.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => {
            const template = s.form_template_versions?.form_templates;
            return (
              <TableRow key={s.id}>
                {showClient && (
                  <TableCell className="font-medium">
                    <Link href={`/forms/submissions?client=${s.client_id}`} className="hover:underline">
                      {s.clients?.display_name}
                    </Link>
                  </TableCell>
                )}
                <TableCell>
                  <Link href={`/forms/submissions/${s.id}`} className="hover:underline">
                    {template ? (locale === "ar" ? template.name_ar : template.name_en) : "—"}
                  </Link>
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {formatDate(s.submitted_at, locale)}
                </TableCell>
                <TableCell>
                  {s.reviewed_at ? (
                    <StatusBadge tone="success">{t("reviewed")}</StatusBadge>
                  ) : (
                    <StatusBadge tone="warning">{t("new")}</StatusBadge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
