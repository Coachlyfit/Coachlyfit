import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { ProgramsService, type ProgramScope } from "@/domain/programs/programs.service";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatDate } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { PageTitle } from "@/components/dashboard/page-title";
import { CreateProgramDialog } from "./create-program-dialog";
import { ProgramsTrashButton } from "./programs-trash-button";

export default async function ProgramsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ scope?: string; client?: string }>;
}) {
  const { locale } = await params;
  const { scope: rawScope, client: defaultClientId } = await searchParams;
  const scope: ProgramScope = rawScope === "templates" ? "templates" : rawScope === "assigned" ? "assigned" : "all";
  const t = await getTranslations("programs");
  const supabase = await createClient();

  const [{ data: clients }, programs] = await Promise.all([
    supabase.from("clients").select("id, display_name").neq("status", "archived"),
    new ProgramsService(supabase).list(scope),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("title")} />
      <div className="flex items-center justify-end gap-2">
        <ProgramsTrashButton locale={locale} />
        <CreateProgramDialog
          locale={locale}
          clients={clients ?? []}
          defaultClientId={defaultClientId}
          defaultOpen={!!defaultClientId}
        />
      </div>

      <div className="flex gap-2">
        <Link
          href="/programs"
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            scope === "all" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("allTab")}
        </Link>
        <Link
          href="/programs?scope=assigned"
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            scope === "assigned"
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("assignedTab")}
        </Link>
        <Link
          href="/programs?scope=templates"
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            scope === "templates"
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("templatesTab")}
        </Link>
      </div>

      {programs.length === 0 ? (
        <Card>
          <EmptyState brandMark title={t("empty.title")} description={t("empty.description")} />
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.name")}</TableHead>
                <TableHead>{t("table.client")}</TableHead>
                <TableHead>{t("table.dates")}</TableHead>
                <TableHead>{t("table.created")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {programs.map((program) => (
                <TableRow key={program.id}>
                  <TableCell className="font-medium">
                    <Link href={`/programs/${program.id}`} className="hover:underline">
                      {pickLocale(program, locale)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {program.clients?.display_name ?? <Badge variant="secondary">{t("template")}</Badge>}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {program.end_date
                      ? t("dateRange", {
                          start: formatDate(program.start_date, locale),
                          end: formatDate(program.end_date, locale),
                        })
                      : `${formatDate(program.start_date, locale)} · ${t("ongoing")}`}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatDate(program.created_at, locale)}
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
