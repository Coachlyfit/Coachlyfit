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
import type { AppLocale } from "@/domain/locale";
import { FeedbackService } from "@/domain/feedback/feedback.service";

// v1 simplification: body + date only, no submitting coach's business_name.
// FeedbackService.listAll() is a flat `select("*")` (see its own comment) --
// attribution would need a second query or lookup map joining coaches by
// id, which isn't worth the added complexity for a first cut of an admin-
// only suggestion box. Add the join (mirrors the `coaches(business_name)`
// embed used in c/coach/page.tsx) if attribution turns out to matter.
export default async function AdminFeedbackPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("admin.feedback");
  const supabase = await createClient();
  const feedback = await new FeedbackService(supabase).listAll();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <Card>
        <CardContent>
          {feedback.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.body")}</TableHead>
                  <TableHead>{t("table.date")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feedback.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-md whitespace-normal">{row.body}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(row.created_at, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
