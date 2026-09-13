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

export type CoachGroup = {
  /** null = "Unassigned" -- clients whose coach row no longer exists. */
  coach: { id: string; name: string; online: boolean; lastSeenAt: string | null } | null;
  clients: OnlineUserRow[];
  onlineCount: number;
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
}

/** Groups a page of rows by coach for the admin view. Pure -- pulled out of
 * PresenceService so it's testable without a fake DB. A "coach" row (role
 * === 'coach', emitted by the RPC only for admin callers) becomes the
 * group's header info instead of a client row inside it; a client whose
 * coach_id is null (coach row deleted/missing) lands in the `coach: null`
 * "Unassigned" group. */
export function groupByCoach(rows: OnlineUserRow[]): CoachGroup[] {
  const groups = new Map<string | null, CoachGroup>();

  function groupFor(coachId: string | null): CoachGroup {
    let g = groups.get(coachId);
    if (!g) {
      g = { coach: null, clients: [], onlineCount: 0 };
      groups.set(coachId, g);
    }
    return g;
  }

  for (const row of rows) {
    if (row.role === "coach") {
      const g = groupFor(row.userId);
      g.coach = { id: row.userId, name: row.name, online: row.online, lastSeenAt: row.lastSeenAt };
      continue;
    }
    const g = groupFor(row.coachId);
    g.clients.push(row);
    if (row.online) g.onlineCount++;
  }

  return [...groups.values()];
}
