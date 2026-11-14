import type { CoachNote, CoachStage } from "@/domain/billing/coach-stage";

/** Shape of the json admin_metrics() returns (see
 * 20261011000002_admin_dashboard.sql) -- the RPC is typed as Json. */
export type AdminMetrics = {
  mrr_egp: number;
  /** Paying coaches only; free-access accounts are counted separately. */
  active_count: number;
  complimentary_count: number;
  trialing_count: number;
  past_due_count: number;
  canceled_count: number;
  churn_rate: number;
  past_due_amount_egp: number;
  canceled_90d_count: number;
  churn_window_complete: boolean;
  plan_mix: { key: string; count: number; mrr_egp: number }[];
  mrr_history: MrrPoint[];
  online_count: number;
};

export type MrrPoint = { month: string; mrr_egp: number };

/** One coach as the three views render it. stage/note/attention are derived
 * on the server (they depend on "now"), so list, cards and kanban can't
 * disagree about a coach's status. */
export type CoachView = {
  id: string;
  name: string;
  owner: string | null;
  phone: string | null;
  tier: string | null;
  /** List price per month; null when there is nothing to bill (trial, cancelled, no plan). */
  amount: number | null;
  /** Free access (not billed); shown as a badge instead of an amount. */
  complimentary: boolean;
  clients: number;
  periodEnd: string | null;
  stage: CoachStage | null;
  note: CoachNote | null;
  attention: boolean;
};

export const COACH_VIEWS = ["list", "cards", "kanban"] as const;
export type CoachesViewMode = (typeof COACH_VIEWS)[number];

export const PERIODS = [3, 6, 12] as const;
export type Period = (typeof PERIODS)[number];
