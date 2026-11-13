import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { SubmissionsService } from "@/domain/forms/submissions.service";
import type { AppLocale } from "@/domain/locale";
import { SubmissionsTable } from "./submissions-table";

export default async function SubmissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ form?: string; client?: string }>;
}) {
  const { locale } = await params;
  const { form: rawForm, client: rawClient } = await searchParams;
  // Not a uuid -> ignore the filter rather than let Postgres throw on the cast.
  const templateId = z.string().uuid().safeParse(rawForm).data;
  const clientId = z.string().uuid().safeParse(rawClient).data;
  const t = await getTranslations("forms.submissions");
  const supabase = await createClient();

  const [submissions, template, client] = await Promise.all([
    new SubmissionsService(supabase).listWithContext({ templateId, clientId }),
    templateId
      ? supabase.from("form_templates").select("name_ar, name_en").eq("id", templateId).maybeSingle()
      : Promise.resolve(null),
    clientId ? supabase.from("clients").select("display_name").eq("id", clientId).maybeSingle() : Promise.resolve(null),
  ]);
  const filters = [
    template?.data && t("filteredBy", { name: locale === "ar" ? template.data.name_ar : template.data.name_en }),
    client?.data && t("filteredByClient", { name: client.data.display_name }),
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {filters.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {filters.join(" · ")} ·{" "}
            <Link href="/forms/submissions" className="font-medium text-primary hover:underline">
              {t("clearFilter")}
            </Link>
          </p>
        )}
      </div>

      {submissions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("empty")}
          </CardContent>
        </Card>
      ) : (
        <SubmissionsTable rows={submissions} locale={locale} />
      )}
    </div>
  );
}
