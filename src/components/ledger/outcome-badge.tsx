import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

export type OutcomeStatus = "pending" | "resolved" | "persisting" | "worse" | "not_evaluable";

const VARIANT_BY_STATUS: Record<OutcomeStatus, "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  pending: "secondary",
  resolved: "success",
  persisting: "warning",
  worse: "destructive",
  not_evaluable: "outline",
};

/** The re-check result the outcome cron writes (domain/ledger/outcomes.ts)
 * — shared between the client's Plan Story, the coach's Decisions tab, and
 * the dashboard's Follow-ups card, so "worse" always reads the same red
 * everywhere a coach or client sees it. */
export function OutcomeBadge({ status }: { status: OutcomeStatus }) {
  const t = useTranslations("ledger.outcome");
  return <Badge variant={VARIANT_BY_STATUS[status]}>{t(status)}</Badge>;
}
