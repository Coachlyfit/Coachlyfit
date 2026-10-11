"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy, MessageCircle, MoreHorizontal, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { formatDate, formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { Amount, CoachAction, CoachAvatar, CoachNoteText, PlanBadge, StageBadge, whatsappUrl } from "./coach-bits";
import type { CoachView } from "./types";

export function CoachesList({ locale, coaches }: { locale: AppLocale; coaches: CoachView[] }) {
  const t = useTranslations("admin.coaches");

  return (
    <Table className="min-w-[900px]">
      <TableHeader>
        <TableRow>
          <TableHead>{t("table.coach")}</TableHead>
          <TableHead>{t("table.tier")}</TableHead>
          <TableHead className="text-end">{t("table.monthly")}</TableHead>
          <TableHead className="text-end">{t("table.clients")}</TableHead>
          <TableHead>{t("table.status")}</TableHead>
          <TableHead>{t("table.period")}</TableHead>
          <TableHead>
            <span className="sr-only">{t("table.actions")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {coaches.map((coach) => {
          const whatsapp = whatsappUrl(coach.phone);
          return (
            <TableRow key={coach.id}>
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <CoachAvatar coach={coach} />
                  <div className="flex min-w-0 flex-col leading-snug">
                    <Link href={`/admin/coaches/${coach.id}`} className="font-semibold hover:underline">
                      {coach.name}
                    </Link>
                    {coach.owner && <span className="text-[0.8125rem] text-muted-foreground">{coach.owner}</span>}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <PlanBadge tier={coach.tier} />
              </TableCell>
              <TableCell className="text-end">
                <Amount value={coach.amount} locale={locale} className="font-semibold" />
              </TableCell>
              <TableCell className="text-end font-mono tabular-nums">{formatNumber(coach.clients, locale)}</TableCell>
              <TableCell>
                <StageBadge stage={coach.stage} />
              </TableCell>
              <TableCell>
                <div className="flex flex-col leading-snug">
                  <span className="font-mono tabular-nums">
                    {coach.periodEnd ? formatDate(coach.periodEnd, locale) : "—"}
                  </span>
                  <CoachNoteText coach={coach} locale={locale} />
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1.5">
                  <CoachAction coach={coach} locale={locale} />
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t("actions.more")} />}
                    >
                      <MoreHorizontal className="size-4" aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-auto min-w-44">
                      <DropdownMenuItem render={<Link href={`/admin/coaches/${coach.id}`} />}>
                        <User className="size-4" />
                        {t("actions.open")}
                      </DropdownMenuItem>
                      {whatsapp && (
                        <DropdownMenuItem render={<a href={whatsapp} target="_blank" rel="noopener noreferrer" />}>
                          <MessageCircle className="size-4" />
                          {t("actions.contact")}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => {
                          navigator.clipboard
                            .writeText(coach.id)
                            .then(() => toast.success(t("actions.copied")))
                            .catch(() => toast.error(t("actions.copyFailed")));
                        }}
                      >
                        <Copy className="size-4" />
                        {t("actions.copyId")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
