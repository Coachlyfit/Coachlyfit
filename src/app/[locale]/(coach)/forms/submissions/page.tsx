import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/domain/locale";

export default async function SubmissionsPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("forms.submissions");
  const supabase = await createClient();

  const { data: submissions } = await supabase
    .from("form_submissions")
    .select(
      "id, submitted_at, clients(display_name), form_template_versions(version, form_templates!form_template_versions_template_id_fkey(name_ar, name_en))"
    )
    .order("submitted_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      {!submissions || submissions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("empty")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.client")}</TableHead>
                <TableHead>{t("table.form")}</TableHead>
                <TableHead>{t("table.submittedAt")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((s) => {
                const template = s.form_template_versions?.form_templates;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.clients?.display_name}</TableCell>
                    <TableCell>
                      <Link href={`/forms/submissions/${s.id}`} className="hover:underline">
                        {template ? (locale === "ar" ? template.name_ar : template.name_en) : "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {formatDate(s.submitted_at, locale)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
