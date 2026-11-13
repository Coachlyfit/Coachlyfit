import { getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { SubmissionsService } from "@/domain/forms/submissions.service";
import type { AppLocale } from "@/domain/locale";
import { SubmissionsTable } from "../../forms/submissions/submissions-table";

export async function FormsSection({ clientId, locale }: { clientId: string; locale: AppLocale }) {
  const t = await getTranslations("forms.submissions");
  const rows = await new SubmissionsService(await createClient()).listWithContext({ clientId });

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-2">
          <EmptyState icon={FileText} title={t("empty")} />
        </CardContent>
      </Card>
    );
  }
  return <SubmissionsTable rows={rows} locale={locale} showClient={false} />;
}
