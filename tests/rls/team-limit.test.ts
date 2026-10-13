// Team seats per plan, enforced in the database (20261020000001):
//   * private.enforce_team_cap(): accepted members plus invites that can still
//     be accepted may not exceed the tier's max_team_members (null = no cap).
//   * A downgrade removes nobody: an over-cap team keeps its members and only
//     loses the ability to invite or to redeem a pending invite.
//   * Only the tenant owner invites and removes; members read the list.
import { createHash, randomBytes } from "node:crypto";
import { type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";

type User = { userId: string; client: SupabaseClient<Database> };

const coachMeta = (tag: string) => ({ role: "coach", full_name: `Coach ${tag}`, business_name: `${tag} Gym`, locale: "ar" });
const memberMeta = (tag: string) => ({ role: "coach", team_invite: true, full_name: `Member ${tag}`, locale: "ar" });
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

async function setSubscription(coachId: string, patch: { status?: string; tierKey?: string }) {
  const update: { status?: string; tier_id?: string } = {};
  if (patch.status) update.status = patch.status;
  if (patch.tierKey) {
    const { data } = await admin.from("subscription_tiers").select("id").eq("key", patch.tierKey).single();
    update.tier_id = data!.id;
  }
  const { error } = await admin.from("subscriptions").update(update).eq("coach_id", coachId);
  if (error) throw error;
}

/** The owner sends an invite the way TeamService.invite does. */
function invite(coach: User, email: string, token = randomBytes(24).toString("base64url")) {
  return coach.client.from("team_members").insert({ coach_id: coach.userId, email, token_hash: hash(token) });
}

/** An already-accepted member, seated with the service role. */
async function seatMember(coach: User, tag: string): Promise<User> {
  const member = await createRlsUser(tag, memberMeta(tag));
  const { error } = await admin.from("team_members").insert({
    coach_id: coach.userId,
    email: `${tag}@example.test`,
    profile_id: member.userId,
    accepted_at: new Date().toISOString(),
  });
  if (error) throw error;
  return member;
}

async function seats(user: User) {
  const { data, error } = await user.client.rpc("get_my_team_seats");
  if (error) throw error;
  return data[0] as { max_members: number | null; used: number; accepted: number };
}

describe("team seat cap", () => {
  it("Starter has no team seats", async () => {
    const coach = await createRlsUser("team-starter", coachMeta("Starter"));
    await setSubscription(coach.userId, { tierKey: "starter" });

    const refused = await invite(coach, "a@example.test");
    expect(refused.error?.code).toBe("23514");
    expect(refused.error?.hint).toBe("team_limit_reached");
    expect(await seats(coach)).toEqual({ max_members: 0, used: 0, accepted: 0 });
  }, 30_000);

  it("Pro takes three, counting pending invites but not expired ones", async () => {
    const coach = await createRlsUser("team-pro", coachMeta("Pro"));
    await setSubscription(coach.userId, { tierKey: "pro" });

    await seatMember(coach, "team-pro-m1");
    expect((await invite(coach, "b@example.test")).error).toBeNull();
    expect((await invite(coach, "c@example.test")).error).toBeNull();
    expect(await seats(coach)).toEqual({ max_members: 3, used: 3, accepted: 1 });

    const fourth = await invite(coach, "d@example.test");
    expect(fourth.error?.hint).toBe("team_limit_reached");

    // An invite past its expiry can't be accepted, so it stops holding a seat.
    await admin
      .from("team_members")
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("coach_id", coach.userId)
      .eq("email", "c@example.test");
    expect((await seats(coach)).used).toBe(2);
    expect((await invite(coach, "d@example.test")).error).toBeNull();
  }, 30_000);

  it("Studio has no cap", async () => {
    const coach = await createRlsUser("team-elite", coachMeta("Elite"));
    for (const n of [1, 2, 3, 4, 5]) {
      expect((await invite(coach, `e${n}@example.test`)).error).toBeNull();
    }
    expect(await seats(coach)).toEqual({ max_members: null, used: 5, accepted: 0 });
  }, 30_000);

  it("a lapsed subscription can't invite, and is told why", async () => {
    const coach = await createRlsUser("team-lapsed", coachMeta("Lapsed"));
    await setSubscription(coach.userId, { status: "canceled" });

    const refused = await invite(coach, "f@example.test");
    expect(refused.error?.hint).toBe("subscription_inactive");
  }, 30_000);
});

describe("downgrade over the cap", () => {
  let coach: User;
  let members: User[];
  let invitee: User;
  const pendingToken = randomBytes(24).toString("base64url");

  beforeAll(async () => {
    coach = await createRlsUser("team-down", coachMeta("Down"));
    members = [];
    for (const n of [1, 2, 3, 4]) members.push(await seatMember(coach, `team-down-m${n}`));
    expect((await invite(coach, "pending@example.test", pendingToken)).error).toBeNull();
    invitee = await createRlsUser("team-down-invitee", memberMeta("Invitee"));

    await setSubscription(coach.userId, { tierKey: "pro" });
  }, 60_000);

  it("keeps every existing member's access", async () => {
    for (const member of members) {
      const { data } = await member.client.from("coaches").select("id");
      expect(data).toEqual([{ id: coach.userId }]);
    }
    expect(await seats(coach)).toEqual({ max_members: 3, used: 5, accepted: 4 });
  });

  it("refuses new invites", async () => {
    expect((await invite(coach, "late@example.test")).error?.hint).toBe("team_limit_reached");
  });

  it("refuses to redeem an invite sent before the downgrade", async () => {
    const accept = await invitee.client.rpc("accept_team_invite", { p_token: pendingToken });
    expect(accept.error?.hint).toBe("team_limit_reached");
    const { data } = await admin.from("team_members").select("accepted_at").eq("token_hash", hash(pendingToken)).single();
    expect(data?.accepted_at).toBeNull();
  });

  it("opens up again once the team is back under the cap", async () => {
    const gone = members.slice(0, 2).map((member) => member.userId);
    const removed = await coach.client.from("team_members").delete().in("profile_id", gone).select("id");
    expect(removed.data).toHaveLength(2);

    // 2 members + the pending invite = 3 of 3: redeemable, but no room to invite.
    expect(await seats(coach)).toEqual({ max_members: 3, used: 3, accepted: 2 });
    expect((await invite(coach, "late@example.test")).error?.hint).toBe("team_limit_reached");

    const accept = await invitee.client.rpc("accept_team_invite", { p_token: pendingToken });
    expect(accept.error).toBeNull();
    expect((await invitee.client.from("coaches").select("id")).data).toEqual([{ id: coach.userId }]);
  });
});

describe("only the owner manages the team", () => {
  let coach: User;
  let member: User;
  let other: User;

  beforeAll(async () => {
    coach = await createRlsUser("team-owner", coachMeta("Owner"));
    member = await seatMember(coach, "team-owner-m1");
    other = await seatMember(coach, "team-owner-m2");
  }, 60_000);

  it("a member reads the team list", async () => {
    const { data } = await member.client.from("team_members").select("profile_id");
    expect(data?.map((row) => row.profile_id).sort()).toEqual([member.userId, other.userId].sort());
  });

  it("a member can't invite", async () => {
    const insert = await member.client
      .from("team_members")
      .insert({ coach_id: coach.userId, email: "sneaky@example.test", token_hash: hash("sneaky") });
    expect(insert.error?.code).toBe("42501");
  });

  it("a member can't remove or edit anyone", async () => {
    const removed = await member.client.from("team_members").delete().eq("profile_id", other.userId).select("id");
    expect(removed.data ?? []).toHaveLength(0);

    const edited = await member.client.from("team_members").update({ email: "x@example.test" }).eq("profile_id", other.userId);
    expect(edited.error?.code).toBe("42501");

    const { data } = await admin.from("team_members").select("id").eq("profile_id", other.userId);
    expect(data).toHaveLength(1);
  });

  it("another coach sees and changes nothing", async () => {
    const stranger = await createRlsUser("team-stranger", coachMeta("Stranger"));
    expect((await stranger.client.from("team_members").select("id").eq("coach_id", coach.userId)).data).toEqual([]);
    const insert = await stranger.client
      .from("team_members")
      .insert({ coach_id: coach.userId, email: "s@example.test", token_hash: hash("stranger") });
    expect(insert.error?.code).toBe("42501");
  }, 30_000);
});
