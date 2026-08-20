import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/domain/locale";

export default async function ClientFormsPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("forms.clientList");
  const supabase = await createClient();

  const { data: assignments } = await supabase
    .from("form_assignments")
    .select("id, status, due_at, assigned_at, form_template_versions(form_templates(name_ar, name_en, kind))")
    .order("assigned_at", { ascending: false });

  const pending = (assignments ?? []).filter((a) => a.status === "pending");
  const completed = (assignments ?? []).filter((a) => a.status === "completed");

  function nameFor(a: (typeof pending)[number]) {
    const template = a.form_template_versions?.form_templates;
    return template ? (locale === "ar" ? template.name_ar : template.name_en) : "—";
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      {(assignments ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {pending.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">{t("pending")}</h2>
              {pending.map((a) => (
                <Link key={a.id} href={`/c/forms/${a.id}`}>
                  <Card className="transition-colors hover:bg-muted/50">
                    <CardContent className="flex items-center justify-between py-4">
                      <span className="font-medium">{nameFor(a)}</span>
                      {a.due_at && (
                        <span className="text-sm text-muted-foreground">
                          {t("dueAt", { date: formatDate(a.due_at, locale) })}
                        </span>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
          {completed.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">{t("completed")}</h2>
              {completed.map((a) => (
                <Card key={a.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <span className="font-medium">{nameFor(a)}</span>
                    <Badge variant="secondary">{t("completed")}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
