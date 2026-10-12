"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import type { EmailDirection } from "@/domain/emails/campaign-email";
import type { CampaignSummary } from "@/domain/emails/campaigns.service";
import { EmailPreview } from "./email-preview";

/** Past campaigns, newest first. Opening one re-renders its stored subject
 * and body through the same template as the composer preview. */
export function HistoryList({
  locale,
  campaigns,
  appUrl,
}: {
  locale: AppLocale;
  campaigns: CampaignSummary[];
  appUrl: string;
}) {
  const t = useTranslations("admin.emails.history");
  const [open, setOpen] = useState<CampaignSummary | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.subject")}</TableHead>
                <TableHead>{t("table.date")}</TableHead>
                <TableHead className="text-end">{t("table.recipients")}</TableHead>
                <TableHead className="text-end">{t("table.sent")}</TableHead>
                <TableHead className="text-end">{t("table.failed")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell className="max-w-xs">
                    <button
                      type="button"
                      onClick={() => setOpen(campaign)}
                      className="block max-w-full truncate text-start font-medium hover:underline"
                    >
                      {campaign.subject}
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(campaign.created_at, locale)}</TableCell>
                  <TableCell className="text-end tabular-nums">{campaign.recipient_count}</TableCell>
                  <TableCell className="text-end tabular-nums">{campaign.sent_count}</TableCell>
                  <TableCell className="text-end tabular-nums">{campaign.failed_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!open} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("viewTitle")}</DialogTitle>
            {open && <DialogDescription>{formatDate(open.created_at, locale)}</DialogDescription>}
          </DialogHeader>
          {open && (
            <EmailPreview
              subject={open.subject}
              body={open.body}
              direction={open.direction as EmailDirection}
              appUrl={appUrl}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
