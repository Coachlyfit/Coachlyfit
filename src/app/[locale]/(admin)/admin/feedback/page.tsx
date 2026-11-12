import { getTranslations } from "next-intl/server";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { RATING_MAX } from "@/domain/feedback/feedback";
import { FeedbackService } from "@/domain/feedback/feedback.service";

// The author is the name snapshot the insert trigger stored (business name for
// a coach, full name for a client): an admin can't read other users' profiles.
export default async function AdminFeedbackPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("admin.feedback");
  const supabase = await createClient();
  const service = new FeedbackService(supabase);
  const feedback = await service.listAll();
  const urls = await service.signScreenshots(
    feedback.flatMap((row) => (row.screenshot_path ? [row.screenshot_path] : []))
  );

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
                  <TableHead>{t("table.author")}</TableHead>
                  <TableHead>{t("table.role")}</TableHead>
                  <TableHead>{t("table.kind")}</TableHead>
                  <TableHead>{t("table.rating")}</TableHead>
                  <TableHead>{t("table.body")}</TableHead>
                  <TableHead>{t("table.screenshot")}</TableHead>
                  <TableHead>{t("table.date")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feedback.map((row) => {
                  const url = row.screenshot_path ? urls[row.screenshot_path] : undefined;
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{row.author_name ?? t("unknownAuthor")}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{t(`roles.${row.author_role as "coach" | "client"}`)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.kind === "bug" ? "warning" : row.kind === "rating" ? "success" : "info"}>
                          {t(`kinds.${row.kind as "bug" | "feature" | "rating"}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.rating ? (
                          <span
                            className="flex items-center gap-0.5"
                            role="img"
                            aria-label={`${row.rating}/${RATING_MAX}`}
                          >
                            {Array.from({ length: RATING_MAX }, (_, i) => (
                              <Star
                                key={i}
                                aria-hidden="true"
                                className={
                                  i < row.rating!
                                    ? "size-3.5 fill-amber-400 text-amber-400"
                                    : "size-3.5 text-muted-foreground"
                                }
                              />
                            ))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-md whitespace-normal">
                        {row.body ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {t("viewScreenshot")}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(row.created_at, locale)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
