// Team tasks, enforced in the database (20261020000002, 20261020000003):
//   * a tenant's tasks never reach another coach, a client or an admin;
//   * the owner does everything, a member sees only what is assigned to them
//     and may change its status and comment -- nothing else;
//   * a plan without task_management hides the tasks and refuses new ones.
import { type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";

type User = { userId: string; client: SupabaseClient<Database> };

const coachMeta = (tag: string) => ({ role: "coach", full_name: `Coach ${tag}`, business_name: `${tag} Gym`, locale: "ar" });
const memberMeta = (tag: string) => ({ role: "coach", team_invite: true, full_name: `Member ${tag}`, locale: "ar" });

async function setTier(coachId: string, tierKey: string) {
  const { data } = await admin.from("subscription_tiers").select("id").eq("key", tierKey).single();
  const { error } = await admin.from("subscriptions").update({ tier_id: data!.id }).eq("coach_id", coachId);
  if (error) throw error;
}

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

async function createTask(coach: User, title: string, patch: { assignee_id?: string; due_date?: string } = {}) {
  const { data, error } = await coach.client
    .from("tasks")
    .insert({ coach_id: coach.userId, title, ...patch })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

describe("tasks", () => {
  let coach: User;
  let member: User;
  let colleague: User;
  let stranger: User;
  let strangerMember: User;
  let mine: string;
  let theirs: string;
  let unassigned: string;

  beforeAll(async () => {
    coach = await createRlsUser("tasks-owner", coachMeta("TasksOwner"));
    stranger = await createRlsUser("tasks-stranger", coachMeta("TasksStranger"));
    member = await seatMember(coach, "tasks-m1");
    colleague = await seatMember(coach, "tasks-m2");
    strangerMember = await seatMember(stranger, "tasks-sm");

    mine = await createTask(coach, "Mine", { assignee_id: member.userId, due_date: "2030-01-01" });
    theirs = await createTask(coach, "Theirs", { assignee_id: colleague.userId });
    unassigned = await createTask(coach, "Unassigned");
  }, 90_000);

  describe("the owner", () => {
    it("sees every task and stamps the assignment", async () => {
      const { data } = await coach.client.from("tasks").select("id, assigned_at, created_by").order("title");
      expect(data).toHaveLength(3);
      const byId = new Map(data!.map((row) => [row.id, row]));
      expect(byId.get(mine)?.assigned_at).not.toBeNull();
      expect(byId.get(unassigned)?.assigned_at).toBeNull();
      expect(byId.get(mine)?.created_by).toBe(coach.userId);
    });

    it("can't assign to someone outside the team, or link another coach's client", async () => {
      const outsider = await coach.client.from("tasks").update({ assignee_id: strangerMember.userId }).eq("id", unassigned);
      expect(outsider.error?.hint).toBe("invalid_assignee");

      const client = await stranger.client
        .from("clients")
        .insert({ coach_id: stranger.userId, display_name: "Not yours" })
        .select("id")
        .single();
      if (client.error) throw client.error;
      const linked = await coach.client.from("tasks").update({ client_id: client.data.id }).eq("id", unassigned);
      expect(linked.error?.hint).toBe("invalid_client");
    });

    it("can't set completed_at by hand", async () => {
      await coach.client.from("tasks").update({ completed_at: "2020-01-01T00:00:00Z" }).eq("id", unassigned);
      const { data } = await admin.from("tasks").select("completed_at").eq("id", unassigned).single();
      expect(data?.completed_at).toBeNull();
    });
  });

  describe("another coach", () => {
    it("sees nothing", async () => {
      expect((await stranger.client.from("tasks").select("id")).data).toEqual([]);
      expect((await stranger.client.from("task_comments").select("id")).data).toEqual([]);
      expect((await strangerMember.client.from("tasks").select("id")).data).toEqual([]);
    });

    it("changes nothing", async () => {
      const insert = await stranger.client.from("tasks").insert({ coach_id: coach.userId, title: "Planted" });
      expect(insert.error?.code).toBe("42501");

      const update = await stranger.client.from("tasks").update({ title: "Hacked" }).eq("id", mine).select("id");
      expect(update.data ?? []).toHaveLength(0);
      const removed = await stranger.client.from("tasks").delete().eq("id", mine).select("id");
      expect(removed.data ?? []).toHaveLength(0);
      const comment = await stranger.client.from("task_comments").insert({ task_id: mine, body: "hi" });
      expect(comment.error).not.toBeNull();

      const { data } = await admin.from("tasks").select("title").eq("id", mine).single();
      expect(data?.title).toBe("Mine");
    });

    it("gets only its own team from the directory", async () => {
      const { data } = await stranger.client.rpc("get_team_directory");
      expect(data?.map((row) => row.profile_id).sort()).toEqual([stranger.userId, strangerMember.userId].sort());
    });
  });

  describe("a team member", () => {
    it("sees only tasks assigned to them", async () => {
      const { data } = await member.client.from("tasks").select("id");
      expect(data).toEqual([{ id: mine }]);
    });

    it("changes the status, and the database stamps completion", async () => {
      const done = await member.client.from("tasks").update({ status: "done" }).eq("id", mine).select("id");
      expect(done.error).toBeNull();
      expect(done.data).toHaveLength(1);
      let row = (await admin.from("tasks").select("completed_at").eq("id", mine).single()).data;
      expect(row?.completed_at).not.toBeNull();

      await member.client.from("tasks").update({ status: "in_progress" }).eq("id", mine);
      row = (await admin.from("tasks").select("completed_at").eq("id", mine).single()).data;
      expect(row?.completed_at).toBeNull();
    });

    it("can't edit anything but the status", async () => {
      for (const patch of [{ title: "Renamed" }, { due_date: "2031-01-01" }, { priority: "low" }, { assignee_id: colleague.userId }]) {
        const update = await member.client.from("tasks").update(patch).eq("id", mine);
        expect(update.error?.code).toBe("42501");
      }
      const { data } = await admin.from("tasks").select("title, due_date, assignee_id").eq("id", mine).single();
      expect(data).toEqual({ title: "Mine", due_date: "2030-01-01", assignee_id: member.userId });
    });

    it("can't create or delete tasks, or touch a colleague's", async () => {
      const insert = await member.client.from("tasks").insert({ coach_id: coach.userId, title: "Self-made" });
      expect(insert.error?.code).toBe("42501");

      const removed = await member.client.from("tasks").delete().eq("id", mine).select("id");
      expect(removed.data ?? []).toHaveLength(0);

      const other = await member.client.from("tasks").update({ status: "done" }).eq("id", theirs).select("id");
      expect(other.data ?? []).toHaveLength(0);
    });

    it("comments on their own task only", async () => {
      expect((await member.client.from("task_comments").insert({ task_id: mine, body: "On it" })).error).toBeNull();
      expect((await member.client.from("task_comments").insert({ task_id: theirs, body: "Nosy" })).error).not.toBeNull();

      await coach.client.from("task_comments").insert({ task_id: theirs, body: "Owner note" });
      const { data } = await member.client.from("task_comments").select("task_id");
      expect(data).toEqual([{ task_id: mine }]);
      // The owner reads the member's comment, with the author recorded.
      const seen = await coach.client.from("task_comments").select("author_id").eq("task_id", mine);
      expect(seen.data).toEqual([{ author_id: member.userId }]);
    });

    it("can't comment as someone else", async () => {
      const forged = await member.client.from("task_comments").insert({ task_id: mine, body: "x", author_id: coach.userId });
      expect(forged.error?.code).toBe("42501");
    });

    it("gets only their own row from task_productivity", async () => {
      // Not in the generated types until 20261020000003 is applied.
      const args = { p_from: "2000-01-01", p_to: "2100-01-01" };
      const own = await member.client.rpc("task_productivity" as never, args as never);
      expect((own.data as unknown as { assignee_id: string }[]).map((row) => row.assignee_id)).toEqual([member.userId]);

      const all = await coach.client.rpc("task_productivity" as never, args as never);
      const rows = all.data as unknown as { assignee_id: string; assigned: number }[];
      expect(rows.map((row) => row.assignee_id).sort()).toEqual([member.userId, colleague.userId].sort());
      expect(rows.every((row) => row.assigned === 1)).toBe(true);
    });
  });

  describe("clients and admins", () => {
    it("have no access", async () => {
      const client = await createRlsUser("tasks-client", { role: "client", full_name: "Client", locale: "ar" });
      const platformAdmin = await createRlsUser("tasks-admin", { role: "admin", full_name: "Admin", locale: "ar" });
      for (const user of [client, platformAdmin]) {
        expect((await user.client.from("tasks").select("id")).data).toEqual([]);
        expect((await user.client.from("task_comments").select("id")).data).toEqual([]);
        const insert = await user.client.from("tasks").insert({ coach_id: coach.userId, title: "Nope" });
        expect(insert.error).not.toBeNull();
      }
    }, 30_000);
  });

  describe("a removed member", () => {
    it("loses access; open tasks go back to unassigned, finished ones keep the name", async () => {
      const finished = await createTask(coach, "Finished", { assignee_id: colleague.userId });
      await coach.client.from("tasks").update({ status: "done" }).eq("id", finished);

      const removed = await coach.client.from("team_members").delete().eq("profile_id", colleague.userId).select("id");
      expect(removed.data).toHaveLength(1);

      expect((await colleague.client.from("tasks").select("id")).data).toEqual([]);
      const { data } = await admin.from("tasks").select("id, assignee_id").in("id", [theirs, finished]);
      const byId = new Map(data!.map((row) => [row.id, row.assignee_id]));
      expect(byId.get(theirs)).toBeNull();
      expect(byId.get(finished)).toBe(colleague.userId);
    });
  });

  describe("a plan without task management", () => {
    it("hides the tasks and refuses new ones, then gives them back on upgrade", async () => {
      await setTier(coach.userId, "starter");

      expect((await coach.client.from("tasks").select("id")).data).toEqual([]);
      expect((await member.client.from("tasks").select("id")).data).toEqual([]);
      const insert = await coach.client.from("tasks").insert({ coach_id: coach.userId, title: "Blocked" });
      expect(insert.error?.hint).toBe("upgrade_required");
      const update = await coach.client.from("tasks").update({ title: "Blocked" }).eq("id", mine).select("id");
      expect(update.data ?? []).toHaveLength(0);

      await setTier(coach.userId, "pro");
      expect((await coach.client.from("tasks").select("id")).data?.length).toBeGreaterThanOrEqual(3);
      expect((await member.client.from("tasks").select("id")).data).toEqual([{ id: mine }]);
    });
  });
});
