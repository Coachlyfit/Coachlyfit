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
import { DietPlansService, type DietPlanScope } from "@/domain/nutrition/diet-plans.service";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatDate } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { PageTitle } from "@/components/dashboard/page-title";
import { CreateDietPlanDialog } from "./create-diet-plan-dialog";
import { DietsTrashButton } from "./diets-trash-button";

export default async function DietsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ scope?: string }>;
}) {
  const { locale } = await params;
  const { scope: rawScope } = await searchParams;
  const scope: DietPlanScope = rawScope === "templates" ? "templates" : rawScope === "assigned" ? "assigned" : "all";
  const t = await getTranslations("diets");
  const supabase = await createClient();

  const [{ data: clients }, plans] = await Promise.all([
    supabase.from("clients").select("id, display_name").neq("status", "archived"),
    new DietPlansService(supabase).list(scope),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("title")} />
      <div className="flex items-center justify-end gap-2">
        <DietsTrashButton locale={locale} />
        <CreateDietPlanDialog locale={locale} clients={clients ?? []} />
      </div>

      <div className="flex gap-2">
        <Link
          href="/diets"
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            scope === "all" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("allTab")}
        </Link>
        <Link
          href="/diets?scope=assigned"
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            scope === "assigned"
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("assignedTab")}
        </Link>
        <Link
          href="/diets?scope=templates"
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            scope === "templates"
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("templatesTab")}
        </Link>
      </div>

      {plans.length === 0 ? (
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
              {plans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">
                    <Link href={`/diets/${plan.id}`} className="hover:underline">
                      {pickLocale(plan, locale)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {plan.clients?.display_name ?? <Badge variant="secondary">{t("template")}</Badge>}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {plan.end_date
                      ? t("dateRange", {
                          start: formatDate(plan.start_date, locale),
                          end: formatDate(plan.end_date, locale),
                        })
                      : `${formatDate(plan.start_date, locale)} · ${t("ongoing")}`}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatDate(plan.created_at, locale)}
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
