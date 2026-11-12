// Feedback (20261112000001_feedback_dialog.sql):
//   * a coach (and a team member, for the owner's tenant) or a client can send
//     feedback as themselves -- never as someone else or in the other role;
//   * it is write-only for them: no read, update or delete;
//   * an admin reads everything, including the author's name and screenshot;
//   * the kind / rating / body rules and the daily cap are the database's;
//   * screenshots go under the sender's own folder, and only an admin reads them.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { createRlsUser, rlsAdmin } from "./rls-test-helpers";

type User = { userId: string; client: SupabaseClient<Database> };

const BUCKET = "feedback-attachments";
const coachMeta = (tag: string) => ({ role: "coach", full_name: `Coach ${tag}`, business_name: `${tag} Gym`, locale: "ar" });
// PNG magic, so the bytes are what the content type says they are.
const png = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" });

let coachA: User;
let coachB: User;
let member: User;
let client: User;
let otherClient: User;
let admin: User;

const sent: string[] = [];
const uploaded: string[] = [];

type Row = Database["public"]["Tables"]["feedback"]["Insert"];

/** A valid coach-side row for `user`, overridable so each test breaks one rule. */
function coachRow(user: User, tenant: string, overrides: Partial<Row> = {}): Row {
  const id = randomUUID();
  sent.push(id);
  return { id, author_id: user.userId, author_role: "coach", coach_id: tenant, kind: "bug", body: "Export is broken", ...overrides };
}

function clientRow(user: User, overrides: Partial<Row> = {}): Row {
  const id = randomUUID();
  sent.push(id);
  return { id, author_id: user.userId, author_role: "client", coach_id: null, kind: "feature", body: "Add dark mode", ...overrides };
}

function send(user: User, row: Row) {
  return user.client.from("feedback").insert(row);
}

async function stored(id: string) {
  const { data, error } = await rlsAdmin.from("feedback").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

async function upload(user: User, path: string, file: Blob = png()) {
  const result = await user.client.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (!result.error) uploaded.push(path);
  return result;
}

afterAll(async () => {
  if (uploaded.length > 0) await rlsAdmin.storage.from(BUCKET).remove(uploaded);
  if (sent.length > 0) await rlsAdmin.from("feedback").delete().in("id", sent);
});

beforeAll(async () => {
  [coachA, coachB, admin, member, client, otherClient] = await Promise.all([
    createRlsUser("fb-coach-a", coachMeta("FeedbackA")),
    createRlsUser("fb-coach-b", coachMeta("FeedbackB")),
    createRlsUser("fb-admin", { role: "admin", full_name: "Admin", locale: "ar" }),
    createRlsUser("fb-member", { role: "coach", team_invite: true, full_name: "Member", locale: "ar" }),
    createRlsUser("fb-client", { role: "client", full_name: "Client One", locale: "ar" }),
    createRlsUser("fb-client-2", { role: "client", full_name: "Client Two", locale: "ar" }),
  ]);

  const seat = await rlsAdmin.from("team_members").insert({
    coach_id: coachA.userId,
    email: "fb-member@example.test",
    profile_id: member.userId,
    accepted_at: new Date().toISOString(),
  });
  if (seat.error) throw seat.error;

  const roster = await rlsAdmin.from("clients").insert([
    { coach_id: coachA.userId, display_name: "Client One", profile_id: client.userId },
    { coach_id: coachA.userId, display_name: "Client Two", profile_id: otherClient.userId },
  ]);
  if (roster.error) throw roster.error;
}, 90_000);

describe("feedback", () => {
  describe("sending", () => {
    it("a coach sends as themselves for their own tenant", async () => {
      const row = coachRow(coachA, coachA.userId);
      expect((await send(coachA, row)).error).toBeNull();
      expect(await stored(row.id!)).toMatchObject({
        author_id: coachA.userId,
        author_role: "coach",
        coach_id: coachA.userId,
        kind: "bug",
        author_name: "FeedbackA Gym",
      });
    });

    it("a team member sends for the owner's tenant, as themselves", async () => {
      const row = coachRow(member, coachA.userId, { kind: "feature" });
      expect((await send(member, row)).error).toBeNull();
      expect(await stored(row.id!)).toMatchObject({ author_id: member.userId, coach_id: coachA.userId });
    });

    it("a client sends with no coach", async () => {
      const row = clientRow(client);
      expect((await send(client, row)).error).toBeNull();
      expect(await stored(row.id!)).toMatchObject({
        author_id: client.userId,
        author_role: "client",
        coach_id: null,
        author_name: "Client One",
      });
    });

    it("the author's name is the database's, whatever the caller sends", async () => {
      const row = clientRow(client, { author_name: "Somebody Else" });
      expect((await send(client, row)).error).toBeNull();
      expect((await stored(row.id!)).author_name).toBe("Client One");
    });

    it("a rating needs no comment", async () => {
      const row = clientRow(client, { kind: "rating", rating: 5, body: null });
      expect((await send(client, row)).error).toBeNull();
      expect(await stored(row.id!)).toMatchObject({ kind: "rating", rating: 5, body: null });
    });
  });

  describe("spoofing", () => {
    it("nobody sends as another user", async () => {
      expect((await send(client, clientRow(otherClient))).error).not.toBeNull();
      expect((await send(coachB, coachRow(coachA, coachA.userId))).error).not.toBeNull();
    });

    it("a client can't send as a coach, or with a coach attached", async () => {
      expect((await send(client, clientRow(client, { author_role: "coach", coach_id: coachA.userId }))).error).not.toBeNull();
      expect((await send(client, clientRow(client, { coach_id: coachA.userId }))).error).not.toBeNull();
    });

    it("a coach can't send as a client, or for another coach's tenant", async () => {
      expect((await send(coachB, coachRow(coachB, coachB.userId, { author_role: "client", coach_id: null }))).error).not.toBeNull();
      expect((await send(coachB, coachRow(coachB, coachA.userId))).error).not.toBeNull();
      expect((await send(coachB, coachRow(coachB, null as unknown as string))).error).not.toBeNull();
    });

    it("an admin has neither role, so can't send", async () => {
      expect((await send(admin, coachRow(admin, admin.userId))).error).not.toBeNull();
      expect((await send(admin, clientRow(admin))).error).not.toBeNull();
    });
  });

  describe("kind, rating and body", () => {
    it("a problem or a feature needs a description", async () => {
      expect((await send(client, clientRow(client, { kind: "bug", body: null }))).error?.code).toBe("23514");
      expect((await send(client, clientRow(client, { kind: "feature", body: "" }))).error?.code).toBe("23514");
    });

    it("a rating is for the rating kind only, and between 1 and 5", async () => {
      expect((await send(client, clientRow(client, { kind: "bug", rating: 3 }))).error?.code).toBe("23514");
      expect((await send(client, clientRow(client, { kind: "rating", rating: null, body: "hi" }))).error?.code).toBe("23514");
      expect((await send(client, clientRow(client, { kind: "rating", rating: 0 }))).error?.code).toBe("23514");
      expect((await send(client, clientRow(client, { kind: "rating", rating: 6 }))).error?.code).toBe("23514");
    });

    it("refuses an unknown kind and an over-long description", async () => {
      expect((await send(client, clientRow(client, { kind: "praise" }))).error?.code).toBe("23514");
      expect((await send(client, clientRow(client, { body: "x".repeat(1001) }))).error?.code).toBe("23514");
    });
  });

  describe("write-only", () => {
    it("the sender can't read, change or delete it", async () => {
      const row = clientRow(client);
      expect((await send(client, row)).error).toBeNull();

      const seen = await client.client.from("feedback").select("id").eq("id", row.id!);
      expect(seen.data ?? []).toHaveLength(0);
      expect((await client.client.from("feedback").update({ body: "Edited" }).eq("id", row.id!)).error).not.toBeNull();
      expect((await client.client.from("feedback").delete().eq("id", row.id!)).error).not.toBeNull();
      expect((await stored(row.id!)).body).toBe("Add dark mode");
    });

    it("another coach or client reads nothing either", async () => {
      for (const user of [coachA, coachB, member, otherClient]) {
        expect(((await user.client.from("feedback").select("id")).data ?? []).length).toBe(0);
      }
    });

    it("an admin reads every row, whoever sent it", async () => {
      const row = clientRow(client);
      expect((await send(client, row)).error).toBeNull();
      const seen = await admin.client.from("feedback").select("id, author_role, author_name").eq("id", row.id!);
      expect(seen.data).toEqual([{ id: row.id, author_role: "client", author_name: "Client One" }]);
    });
  });

  it("caps feedback per author per day", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await send(coachB, coachRow(coachB, coachB.userId))).error).toBeNull();
    }
    expect((await send(coachB, coachRow(coachB, coachB.userId))).error?.hint).toBe("too_many_today");
    // The cap is per author: nobody else is affected.
    expect((await send(otherClient, clientRow(otherClient))).error).toBeNull();
  });

  describe("screenshots", () => {
    const feedbackId = randomUUID();
    let path: string;

    beforeAll(() => {
      path = `${client.userId}/${feedbackId}/${randomUUID()}.png`;
    });

    it("the sender uploads under their own folder and attaches it to that feedback", async () => {
      expect((await upload(client, path)).error).toBeNull();
      const row = clientRow(client, { id: feedbackId, screenshot_path: path });
      sent.push(feedbackId);
      expect((await send(client, row)).error).toBeNull();
      expect((await stored(feedbackId)).screenshot_path).toBe(path);
    });

    it("a feedback can't name a file outside its own folder", async () => {
      const elsewhere = await send(client, clientRow(client, { screenshot_path: path }));
      expect(elsewhere.error?.hint).toBe("invalid_attachment");
      const theirs = `${otherClient.userId}/${randomUUID()}/a.png`;
      expect((await send(client, clientRow(client, { screenshot_path: theirs }))).error?.hint).toBe("invalid_attachment");
    });

    it("only an admin reads it -- not even the sender", async () => {
      expect((await admin.client.storage.from(BUCKET).createSignedUrl(path, 60)).error).toBeNull();
      for (const user of [client, otherClient, coachA, member]) {
        expect((await user.client.storage.from(BUCKET).createSignedUrl(path, 60)).error).not.toBeNull();
        expect((await user.client.storage.from(BUCKET).download(path)).error).not.toBeNull();
      }
    });

    it("a coach uploads under their own folder too", async () => {
      expect((await upload(coachA, `${coachA.userId}/${randomUUID()}/${randomUUID()}.png`)).error).toBeNull();
    });

    it("nobody uploads into someone else's folder, and an admin has no folder", async () => {
      const intoClient = `${client.userId}/${randomUUID()}/${randomUUID()}.png`;
      for (const user of [otherClient, coachA, admin]) {
        expect((await upload(user, intoClient)).error).not.toBeNull();
      }
      expect((await upload(admin, `${admin.userId}/${randomUUID()}/${randomUUID()}.png`)).error).not.toBeNull();
    });

    it("nobody overwrites or deletes a file", async () => {
      expect((await client.client.storage.from(BUCKET).upload(path, png(), { upsert: true })).error).not.toBeNull();
      // remove() reports success with an empty list when RLS hides the row.
      await client.client.storage.from(BUCKET).remove([path]);
      expect((await admin.client.storage.from(BUCKET).createSignedUrl(path, 60)).error).toBeNull();
    });

    it("the bucket refuses other file types and anything over the size cap", async () => {
      const folder = `${client.userId}/${randomUUID()}`;
      const text = new Blob(["hello"], { type: "text/plain" });
      expect((await upload(client, `${folder}/a.png`, text)).error).not.toBeNull();

      const big = new Blob([new Uint8Array(5_300_000)], { type: "image/png" });
      expect((await upload(client, `${folder}/b.png`, big)).error).not.toBeNull();
    });
  });
});
