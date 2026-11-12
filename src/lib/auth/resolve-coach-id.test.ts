import { describe, expect, it } from "vitest";
import { resolveCoachId } from "./resolve-coach-id";

// Mirrors invites.service.test.ts's fakeSupabase style: a plain object with
// a .from(table) method returning chainable stubs, no mocking library.
function fakeSupabase(opts: {
  userId: string | null;
  profileRole?: string | null;
  coachRow: { id: string; archived_at?: string | null } | null;
  membershipRow: { coach_id: string } | null;
}) {
  const db = {
    auth: {
      getUser: async () => ({ data: { user: opts.userId ? { id: opts.userId } : null } }),
    },
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: opts.profileRole ? { role: opts.profileRole } : null, error: null }),
            }),
          }),
        };
      }
      if (table === "coaches") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: opts.coachRow, error: null }),
            }),
          }),
        };
      }
      if (table === "team_members") {
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                maybeSingle: async () => ({ data: opts.membershipRow, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  return db as never;
}

describe("resolveCoachId", () => {
  it("returns null when there is no authenticated user", async () => {
    const db = fakeSupabase({ userId: null, coachRow: null, membershipRow: null });
    expect(await resolveCoachId(db)).toBeNull();
  });

  it("returns the user's own id when they own a coaches row (tenant owner)", async () => {
    const db = fakeSupabase({ userId: "owner-1", profileRole: "coach", coachRow: { id: "owner-1" }, membershipRow: null });
    expect(await resolveCoachId(db)).toBe("owner-1");
  });

  it("returns null when the user owns a coaches row but their profile role isn't 'coach' (mirrors private.coach_id()'s owner branch)", async () => {
    const db = fakeSupabase({ userId: "owner-1", profileRole: "client", coachRow: { id: "owner-1" }, membershipRow: null });
    expect(await resolveCoachId(db)).toBeNull();
  });

  it("returns the mapped coach_id when the user is an accepted team member", async () => {
    const db = fakeSupabase({ userId: "member-1", coachRow: null, membershipRow: { coach_id: "owner-1" } });
    expect(await resolveCoachId(db)).toBe("owner-1");
  });

  it("returns the team's coach_id when the user's own workspace was archived on joining a team", async () => {
    const db = fakeSupabase({
      userId: "member-1",
      profileRole: "coach",
      coachRow: { id: "member-1", archived_at: "2026-11-12T00:00:00Z" },
      membershipRow: { coach_id: "owner-1" },
    });
    expect(await resolveCoachId(db)).toBe("owner-1");
  });

  it("returns null when the user owns no tenant and has no accepted membership", async () => {
    const db = fakeSupabase({ userId: "stranger-1", coachRow: null, membershipRow: null });
    expect(await resolveCoachId(db)).toBeNull();
  });
});
