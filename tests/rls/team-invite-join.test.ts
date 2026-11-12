// Team invites are linked in the database, never from a client-sent coach id
// (20261112000003):
//   * Signup: handle_new_user() reads team_invite_token_hash from the signup
//     metadata and calls private.claim_team_invite() in the same transaction.
//     A bad invite rolls the signup back; a good one creates no coaches row.
//   * Existing account: accept_team_invite() calls the same function.
//   * An account that owns a truly EMPTY workspace joins and the workspace is
//     archived; one with data or a paid plan is refused (owns_business).
//   * Token: single use, expires, and tied to the invited email.
import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { rlsAdmin as admin, createRlsUser, trackRlsUser } from "./rls-test-helpers";

type User = { userId: string; email: string; client: SupabaseClient<Database> };

const PASSWORD = "correct horse battery staple";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(24).toString("base64url");
const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
const coachMeta = (tag: string) => ({ role: "coach", full_name: `Coach ${tag}`, business_name: `${tag} Gym`, locale: "ar" });

/** A pending invite from `coachId` to `email`, seated by the service role. */
async function pendingInvite(coachId: string, email: string, patch: { expired?: boolean } = {}) {
  const token = newToken();
  const { error } = await admin.from("team_members").insert({
    coach_id: coachId,
    email,
    token_hash: hash(token),
    ...(patch.expired ? { expires_at: new Date(Date.now() - 60_000).toISOString() } : {}),
  });
  if (error) throw error;
  return token;
}

/** What the join-team signup does: the same metadata, straight to Auth. */
function signUpWithInvite(email: string, token: string) {
  return admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      role: "coach",
      team_invite: true,
      team_invite_token_hash: hash(token),
      full_name: "Invitee",
      locale: "ar",
    },
  });
}

async function inviteRow(token: string) {
  const { data, error } = await admin.from("team_members").select("*").eq("token_hash", hash(token)).single();
  if (error) throw error;
  return data;
}

let owner: User;
let stranger: User;

beforeAll(async () => {
  owner = await createRlsUser("tij-owner", coachMeta("Owner"));
  stranger = await createRlsUser("tij-stranger", coachMeta("Stranger"));
  const strangerClient = await admin.from("clients").insert({ coach_id: stranger.userId, display_name: "Stranger's client" });
  if (strangerClient.error) throw strangerClient.error;
}, 60_000);

describe("signup path", () => {
  it("links the new account to the inviter's team and creates no workspace", async () => {
    const email = uniqueEmail("tij-new");
    const token = await pendingInvite(owner.userId, email);

    const { data, error } = await signUpWithInvite(email, token);
    expect(error).toBeNull();
    trackRlsUser(data.user!.id);

    const invite = await inviteRow(token);
    expect(invite.profile_id).toBe(data.user!.id);
    expect(invite.accepted_at).not.toBeNull();

    const { data: coachRow } = await admin.from("coaches").select("id").eq("id", data.user!.id);
    expect(coachRow).toEqual([]);

    const { data: profile } = await admin.from("profiles").select("role").eq("id", data.user!.id).single();
    expect(profile?.role).toBe("coach");

    // As the member: the owner's tenant is theirs, and only theirs.
    const member = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    expect((await member.auth.signInWithPassword({ email, password: PASSWORD })).error).toBeNull();
    expect((await member.from("coaches").select("id")).data).toEqual([{ id: owner.userId }]);
    expect((await member.from("clients").select("coach_id").eq("coach_id", stranger.userId)).data).toEqual([]);
  }, 30_000);

  it("rejects a signup whose email isn't the invited one, leaving the invite pending", async () => {
    const token = await pendingInvite(owner.userId, uniqueEmail("tij-invited"));
    const { data, error } = await signUpWithInvite(uniqueEmail("tij-other"), token);
    expect(error).not.toBeNull();
    if (data?.user) trackRlsUser(data.user.id);
    expect((await inviteRow(token)).accepted_at).toBeNull();
  }, 30_000);

  it("rejects an expired invite", async () => {
    const email = uniqueEmail("tij-expired");
    const token = await pendingInvite(owner.userId, email, { expired: true });
    const { data, error } = await signUpWithInvite(email, token);
    expect(error).not.toBeNull();
    if (data?.user) trackRlsUser(data.user.id);
    expect((await inviteRow(token)).accepted_at).toBeNull();
  }, 30_000);

  it("rejects a token that matches no invite", async () => {
    const { data, error } = await signUpWithInvite(uniqueEmail("tij-bogus"), newToken());
    expect(error).not.toBeNull();
    if (data?.user) trackRlsUser(data.user.id);
  }, 30_000);
});

describe("existing account path", () => {
  it("an empty workspace joins the team and is archived", async () => {
    const invitee = await createRlsUser("tij-empty", coachMeta("Empty"));
    const token = await pendingInvite(owner.userId, invitee.email);

    const accept = await invitee.client.rpc("accept_team_invite", { p_token: token });
    expect(accept.error).toBeNull();

    const invite = await inviteRow(token);
    expect(invite.profile_id).toBe(invitee.userId);
    expect(invite.accepted_at).not.toBeNull();

    const { data: coachRow } = await admin.from("coaches").select("archived_at").eq("id", invitee.userId).single();
    expect(coachRow?.archived_at).not.toBeNull();
    const { data: sub } = await admin.from("subscriptions").select("status").eq("coach_id", invitee.userId).single();
    expect(sub?.status).toBe("canceled");

    // The owner's tenant is theirs now; their archived one no longer is.
    expect((await invitee.client.from("coaches").select("id")).data).toContainEqual({ id: owner.userId });
    const asOwner = await invitee.client
      .from("team_members")
      .insert({ coach_id: invitee.userId, email: "x@example.test", token_hash: hash(newToken()) });
    expect(asOwner.error?.code).toBe("42501");
    expect((await invitee.client.from("clients").select("coach_id").eq("coach_id", stranger.userId)).data).toEqual([]);
  }, 30_000);

  it("an archived account can't un-archive itself", async () => {
    const invitee = await createRlsUser("tij-unarchive", coachMeta("Unarchive"));
    const token = await pendingInvite(owner.userId, invitee.email);
    expect((await invitee.client.rpc("accept_team_invite", { p_token: token })).error).toBeNull();

    const undo = await invitee.client.from("coaches").update({ archived_at: null }).eq("id", invitee.userId);
    expect(undo.error).not.toBeNull();
    const { data } = await admin.from("coaches").select("archived_at").eq("id", invitee.userId).single();
    expect(data?.archived_at).not.toBeNull();
  }, 30_000);

  it("a workspace with data is refused and left untouched", async () => {
    const invitee = await createRlsUser("tij-data", coachMeta("HasData"));
    const added = await admin.from("clients").insert({ coach_id: invitee.userId, display_name: "Their client" });
    expect(added.error).toBeNull();
    const token = await pendingInvite(owner.userId, invitee.email);

    const accept = await invitee.client.rpc("accept_team_invite", { p_token: token });
    expect(accept.error?.hint).toBe("owns_business");

    expect((await inviteRow(token)).accepted_at).toBeNull();
    const { data: coachRow } = await admin.from("coaches").select("archived_at").eq("id", invitee.userId).single();
    expect(coachRow?.archived_at).toBeNull();
    const { data: sub } = await admin.from("subscriptions").select("status").eq("coach_id", invitee.userId).single();
    expect(sub?.status).toBe("trialing");
  }, 30_000);

  it("a paid subscription is refused even with no data", async () => {
    const invitee = await createRlsUser("tij-paid", coachMeta("Paid"));
    await admin.from("subscriptions").update({ status: "active" }).eq("coach_id", invitee.userId);
    const token = await pendingInvite(owner.userId, invitee.email);

    const accept = await invitee.client.rpc("accept_team_invite", { p_token: token });
    expect(accept.error?.hint).toBe("owns_business");
    expect((await inviteRow(token)).accepted_at).toBeNull();
  }, 30_000);

  it("refuses an invite sent to a different email", async () => {
    const invitee = await createRlsUser("tij-wrongmail", { ...coachMeta("Wrong"), team_invite: true });
    const token = await pendingInvite(owner.userId, uniqueEmail("tij-someone-else"));

    const accept = await invitee.client.rpc("accept_team_invite", { p_token: token });
    expect(accept.error?.hint).toBe("email_mismatch");
    expect((await inviteRow(token)).accepted_at).toBeNull();
  }, 30_000);

  it("a token works once, and not after it expires", async () => {
    const invitee = await createRlsUser("tij-once", { ...coachMeta("Once"), team_invite: true });
    const token = await pendingInvite(owner.userId, invitee.email);
    expect((await invitee.client.rpc("accept_team_invite", { p_token: token })).error).toBeNull();
    expect((await invitee.client.rpc("accept_team_invite", { p_token: token })).error).not.toBeNull();

    const late = await createRlsUser("tij-late", { ...coachMeta("Late"), team_invite: true });
    const expired = await pendingInvite(owner.userId, late.email, { expired: true });
    expect((await late.client.rpc("accept_team_invite", { p_token: expired })).error).not.toBeNull();
    expect((await inviteRow(expired)).accepted_at).toBeNull();
  }, 30_000);

  it("the owner can't redeem an invite to their own team", async () => {
    const self = await createRlsUser("tij-self", coachMeta("Self"));
    const token = await pendingInvite(self.userId, self.email);

    const accept = await self.client.rpc("accept_team_invite", { p_token: token });
    expect(accept.error?.hint).toBe("owns_business");
    const { data } = await admin.from("coaches").select("archived_at").eq("id", self.userId).single();
    expect(data?.archived_at).toBeNull();
  }, 30_000);
});
