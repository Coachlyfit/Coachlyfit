"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { Link } from "@/i18n/navigation";
import { RecordPaymentDialog } from "./record-payment-dialog";

type Coach = {
  coach_id: string;
  business_name: string;
  phone: string | null;
  tier_key: string | null;
  status: string | null;
  mrr_egp: number;
  client_count: number;
  current_period_end: string | null;
};

type Segment = "all" | "at_risk" | "trialing" | "starter" | "pro" | "elite";

function healthFor(status: string | null): "good" | "atRisk" | "stalled" | "trial" | "none" {
  if (status === "active") return "good";
  if (status === "past_due") return "atRisk";
  if (status === "canceled") return "stalled";
  if (status === "trialing") return "trial";
  return "none";
}

const HEALTH_VARIANT = {
  good: "success",
  atRisk: "warning",
  stalled: "destructive",
  trial: "info",
  none: "outline",
} as const;

export function CoachesTable({ locale, coaches }: { locale: AppLocale; coaches: Coach[] }) {
  const t = useTranslations("admin.coaches");
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<Segment>("all");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return coaches
      .filter((c) => {
        if (segment === "all") return true;
        if (segment === "at_risk") return c.status === "past_due";
        if (segment === "trialing") return c.status === "trialing";
        return c.tier_key === segment;
      })
      .filter(
        (c) =>
          !q ||
          c.business_name.toLowerCase().includes(q) ||
          c.coach_id.includes(q) ||
          (c.phone ?? "").toLowerCase().includes(q)
      );
  }, [coaches, query, segment]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-2.5 my-auto size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
            className="h-9 ps-8"
          />
        </div>
        <div className="overflow-x-auto">
          <Segmented
            value={segment}
            onChange={setSegment}
            label={t("filterLabel")}
            options={[
              { value: "all", label: t("segments.all") },
              { value: "at_risk", label: t("segments.atRisk") },
              { value: "trialing", label: t("segments.trialing") },
              { value: "starter", label: t("segments.starter") },
              { value: "pro", label: t("segments.pro") },
              { value: "elite", label: t("segments.elite") },
            ]}
          />
        </div>
        <span className="ms-auto text-xs text-muted-foreground">
          {t("shownCount", { shown: shown.length, total: coaches.length })}
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("table.business")}</TableHead>
            <TableHead>{t("table.tier")}</TableHead>
            <TableHead>{t("table.mrr")}</TableHead>
            <TableHead>{t("table.clients")}</TableHead>
            <TableHead>{t("table.health")}</TableHead>
            <TableHead>{t("table.period")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((coach) => {
            const health = healthFor(coach.status);
            return (
              <TableRow key={coach.coach_id}>
                <TableCell className="font-medium">
                  <Link href={`/admin/coaches/${coach.coach_id}`} className="hover:underline">
                    {coach.business_name}
                  </Link>
                  {coach.phone && <div className="font-mono text-xs text-muted-foreground">{coach.phone}</div>}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{coach.tier_key ?? "—"}</Badge>
                </TableCell>
                <TableCell className="tabular-nums">
                  {coach.mrr_egp > 0 ? formatNumber(coach.mrr_egp, locale) : "—"}
                </TableCell>
                <TableCell className="tabular-nums">{coach.client_count}</TableCell>
                <TableCell>
                  <Badge variant={HEALTH_VARIANT[health]}>{t(`health.${health}`)}</Badge>
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {coach.current_period_end ? formatDate(coach.current_period_end, locale) : "—"}
                </TableCell>
                <TableCell>
                  <RecordPaymentDialog locale={locale} coachId={coach.coach_id} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
