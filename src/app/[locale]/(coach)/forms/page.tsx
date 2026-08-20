import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { TemplatesService } from "@/domain/forms/templates.service";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { Link } from "@/i18n/navigation";
import { PageTitle } from "@/components/dashboard/page-title";
import { CreateTemplateDialog } from "./create-template-dialog";

export default async function FormsPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("forms");
  const tKinds = await getTranslations("forms.kinds");
  const supabase = await createClient();
  const templates = await new TemplatesService(supabase).list();

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("title")} />
      <div className="flex items-center justify-end">
        <CreateTemplateDialog locale={locale} />
      </div>

      {templates.length === 0 ? (
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
                <TableHead>{t("table.name")}</TableHead>
                <TableHead>{t("table.kind")}</TableHead>
                <TableHead>{t("table.updated")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="font-medium">
                    <Link href={`/forms/${template.id}`} className="hover:underline">
                      {locale === "ar" ? template.name_ar : template.name_en}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{tKinds(template.kind)}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatDate(template.created_at, locale)}
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
