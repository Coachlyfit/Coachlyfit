import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Kept in sync with the `online` computation inside list_online_users() in
 * supabase/migrations/20260914000001_presence.sql -- this constant is
 * display-only here (the DB is the source of truth for the boolean), used
 * for UI copy like "online in the last 5 minutes". */
export const ONLINE_WINDOW_MINUTES = 5;

export const PRESENCE_PAGE_SIZE = 50;

export type OnlineUserRow = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: Database["public"]["Enums"]["user_role"];
  coachId: string | null;
  coachName: string | null;
  lastSeenAt: string | null;
  online: boolean;
};

export type OnlineUsersPage = {
  rows: OnlineUserRow[];
  total: number;
  online: number;
};

/** One coach on the admin "Online now" page. clientUserIds are the account
 * ids of their clients -- what the presence state is matched against to get
 * "online / total" without loading the clients themselves. */
export type OnlineCoach = {
  id: string;
  name: string;
  lastSeenAt: string | null;
  clientTotal: number;
  clientUserIds: string[];
};

export type OnlineSummary = {
  coachTotal: number;
  clientTotal: number;
  activeToday: number;
  active7d: number;
  neverCount: number;
  coaches: OnlineCoach[];
};

/** userId is null for an invited client who has no account yet -- the only
 * kind a new invite link can be made for (canInvite). */
export type CoachClientRow = {
  clientId: string;
  userId: string | null;
  name: string;
  lastSeenAt: string | null;
  canInvite: boolean;
};

type SummaryJson = {
  coach_total: number;
  client_total: number;
  active_today: number;
  active_7d: number;
  never_count: number;
  coaches: { id: string; name: string; last_seen_at: string | null; client_total: number; client_user_ids: string[] }[];
};

/** Presence = "online now" (last_seen_at within ONLINE_WINDOW_MINUTES),
 * distinct from clients.status = 'active' (invite accepted) or
 * subscriptions.status = 'active' (billing) -- see the migration's header
 * comment. Role-scoping to "my clients" vs "everyone" happens entirely
 * inside list_online_users(); there is deliberately no coach-id parameter
 * here for a coach to pass (or tamper with) -- the RPC always resolves
 * scope from the caller's own auth.uid(). */
export class PresenceService {
  constructor(private db: SupabaseClient<Database>) {}

  /** Heartbeat -- call on mount and on an interval while the tab is
   * visible. Server-side rate-limited (30s) so a hot client can't turn
   * this into a write-amplification vector; safe to call often. */
  async touch(): Promise<void> {
    const { error } = await this.db.rpc("touch_last_seen");
    if (error) throw error;
  }

  async list(opts: { search?: string; page?: number; pageSize?: number } = {}): Promise<OnlineUsersPage> {
    const pageSize = opts.pageSize ?? PRESENCE_PAGE_SIZE;
    const page = opts.page ?? 1;
    const { data, error } = await this.db.rpc("list_online_users", {
      p_search: opts.search?.trim() || undefined,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    });
    if (error) throw error;

    const rows: OnlineUserRow[] = (data ?? []).map((r) => ({
      userId: r.user_id,
      name: r.name,
      avatarUrl: r.avatar_url,
      role: r.role,
      coachId: r.coach_id,
      coachName: r.coach_name,
      lastSeenAt: r.last_seen_at,
      online: r.online,
    }));

    return {
      rows,
      total: data?.[0]?.total_count ?? 0,
      online: data?.[0]?.online_count ?? 0,
    };
  }

  /** Admin only (admin_online_summary() checks). Every aggregate on the
   * "Online now" page plus the coach list, in one call. */
  async adminSummary(): Promise<OnlineSummary> {
    const { data, error } = await this.db.rpc("admin_online_summary");
    if (error) throw error;
    const json = data as SummaryJson;
    return {
      coachTotal: json.coach_total,
      clientTotal: json.client_total,
      activeToday: json.active_today,
      active7d: json.active_7d,
      neverCount: json.never_count,
      coaches: json.coaches.map((c) => ({
        id: c.id,
        name: c.name,
        lastSeenAt: c.last_seen_at,
        clientTotal: c.client_total,
        clientUserIds: c.client_user_ids,
      })),
    };
  }

  /** Admin only. One coach's active, non-archived clients. */
  async adminCoachClients(coachId: string): Promise<CoachClientRow[]> {
    const { data, error } = await this.db.rpc("admin_coach_clients", { p_coach_id: coachId });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      clientId: r.client_id,
      userId: r.user_id,
      name: r.name,
      lastSeenAt: r.last_seen_at,
      canInvite: r.can_invite,
    }));
  }
}
