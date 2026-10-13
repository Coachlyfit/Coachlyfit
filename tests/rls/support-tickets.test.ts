// Support tickets (20261024000001_support_tickets.sql):
//   * a ticket belongs to the tenant owner; another coach, a team member of
//     the same tenant and a client see nothing and can't write;
//   * the owner opens, replies, marks read and reopens -- never sets a status
//     and never sees an internal note;
//   * an admin sees and does everything;
//   * attachments live under the owner's folder and only they and an admin
//     reach them;
//   * each side is notified of what the other did, once
//     (20261024000002_support_notifications.sql).
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { createRlsUser, rlsAdmin } from "./rls-test-helpers";

type User = { userId: string; client: SupabaseClient<Database> };

const BUCKET = "support-attachments";
const coachMeta = (tag: string) => ({ role: "coach", full_name: `Coach ${tag}`, business_name: `${tag} Gym`, locale: "ar" });
// PNG magic, so the bytes are what the content type says they are.
const png = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" });

let coachA: User;
let coachB: User;
let member: User;
let client: User;
let admin: User;
let ticketId: string;
let firstMessageId: string;

// Every ticket the suite opens, so the notifications they send to the
// project's real admins can be removed when it ends.
const opened: string[] = [];

function openTicket(user: User, overrides: { p_id?: string; p_message_id?: string } = {}) {
  const id = overrides.p_id ?? randomUUID();
  opened.push(id);
  return user.client.rpc("create_support_ticket", {
    p_message_id: randomUUID(),
    p_subject: "Cannot export invoices",
    p_category: "technical",
    p_body: "The export button does nothing.",
    ...overrides,
    p_id: id,
  });
}

async function notificationKinds(profileId: string, ticket: string) {
  const { data, error } = await rlsAdmin
    .from("notifications")
    .select("kind")
    .eq("profile_id", profileId)
    .eq("payload->>ticket_id", ticket);
  if (error) throw error;
  return data.map((row) => row.kind).sort();
}

function reply(user: User, ticket: string, overrides: Record<string, unknown> = {}) {
  return user.client
    .from("ticket_messages")
    .insert({ ticket_id: ticket, author_id: user.userId, sender_role: "coach", body: "More detail", ...overrides })
    .select("id, sender_role, is_internal")
    .single();
}

async function ticketRow(id: string) {
  const { data, error } = await rlsAdmin.from("support_tickets").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

// Attachments are immutable for users, so the files this suite uploads are
// removed with the service role when it ends.
const uploaded: string[] = [];

async function upload(user: User, path: string, file: Blob = png()) {
  const result = await user.client.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (!result.error) uploaded.push(path);
  return result;
}

afterAll(async () => {
  if (uploaded.length > 0) await rlsAdmin.storage.from(BUCKET).remove(uploaded);
  if (opened.length > 0) {
    await rlsAdmin.from("notifications").delete().like("kind", "support\\_%").in("payload->>ticket_id", opened);
  }
});

beforeAll(async () => {
  [coachA, coachB, admin, member, client] = await Promise.all([
    createRlsUser("support-coach-a", coachMeta("SupportA")),
    createRlsUser("support-coach-b", coachMeta("SupportB")),
    createRlsUser("support-admin", { role: "admin", full_name: "Admin", locale: "ar" }),
    createRlsUser("support-member", { role: "coach", team_invite: true, full_name: "Member", locale: "ar" }),
    createRlsUser("support-client", { role: "client", full_name: "Client", locale: "ar" }),
  ]);

  const seat = await rlsAdmin.from("team_members").insert({
    coach_id: coachA.userId,
    email: "support-member@example.test",
    profile_id: member.userId,
    accepted_at: new Date().toISOString(),
  });
  if (seat.error) throw seat.error;

  const roster = await rlsAdmin
    .from("clients")
    .insert({ coach_id: coachA.userId, display_name: "Client", profile_id: client.userId });
  if (roster.error) throw roster.error;

  ticketId = randomUUID();
  firstMessageId = randomUUID();
  const opened = await openTicket(coachA, { p_id: ticketId, p_message_id: firstMessageId });
  if (opened.error) throw opened.error;
}, 90_000);

describe("support tickets", () => {
  describe("the owner", () => {
    it("sees their ticket and its first message", async () => {
      const tickets = await coachA.client.from("support_tickets").select("id, status, coach_id, admin_unread, coach_unread");
      expect(tickets.data).toEqual([
        { id: ticketId, status: "open", coach_id: coachA.userId, admin_unread: true, coach_unread: false },
      ]);

      const messages = await coachA.client.from("ticket_messages").select("id, sender_role, author_id");
      expect(messages.data).toEqual([{ id: firstMessageId, sender_role: "coach", author_id: coachA.userId }]);
    });

    it("can't insert a ticket directly or change one", async () => {
      const inserted = await coachA.client
        .from("support_tickets")
        .insert({ coach_id: coachA.userId, subject: "Direct insert", category: "other" });
      expect(inserted.error).not.toBeNull();

      const updated = await coachA.client
        .from("support_tickets")
        .update({ status: "closed", subject: "Changed" })
        .eq("id", ticketId)
        .select("id");
      expect(updated.data ?? []).toHaveLength(0);
      expect((await ticketRow(ticketId)).status).toBe("open");
    });

    it("can't write as an admin or leave an internal note", async () => {
      const forged = await reply(coachA, ticketId, { sender_role: "admin" });
      expect(forged.error).toBeNull();
      expect(forged.data?.sender_role).toBe("coach");

      const internal = await reply(coachA, ticketId, { is_internal: true });
      expect(internal.error).not.toBeNull();
    });

    it("can't edit or delete a message", async () => {
      const edited = await coachA.client.from("ticket_messages").update({ body: "Edited" }).eq("id", firstMessageId);
      expect(edited.error).not.toBeNull();
      const deleted = await coachA.client.from("ticket_messages").delete().eq("id", firstMessageId);
      expect(deleted.error).not.toBeNull();
    });
  });

  describe("everyone else on the coach side", () => {
    it("another coach, a team member and a client see no tickets or messages", async () => {
      for (const user of [coachB, member, client]) {
        expect((await user.client.from("support_tickets").select("id")).data ?? []).toHaveLength(0);
        expect((await user.client.from("ticket_messages").select("id")).data ?? []).toHaveLength(0);
      }
    });

    it("none of them can reply on the ticket", async () => {
      for (const user of [coachB, member, client]) {
        expect((await reply(user, ticketId)).error).not.toBeNull();
      }
    });

    it("a team member and a client can't open a ticket", async () => {
      for (const user of [member, client]) {
        expect((await openTicket(user)).error?.code).toBe("42501");
      }
    });

    it("another coach can't mark it read or reopen it", async () => {
      await rlsAdmin.from("support_tickets").update({ coach_unread: true }).eq("id", ticketId);
      expect((await coachB.client.rpc("support_mark_read", { p_ticket_id: ticketId })).error).toBeNull();
      expect((await ticketRow(ticketId)).coach_unread).toBe(true);

      const reopened = await coachB.client.rpc("support_reopen_ticket", { p_ticket_id: ticketId });
      expect(reopened.error?.hint).toBe("reopen_not_allowed");
    });
  });

  describe("the admin", () => {
    it("sees every ticket, and opening it clears the admin's unread flag only", async () => {
      const { data } = await admin.client.from("support_tickets").select("id").eq("id", ticketId);
      expect(data).toHaveLength(1);

      expect((await admin.client.rpc("support_mark_read", { p_ticket_id: ticketId })).error).toBeNull();
      const row = await ticketRow(ticketId);
      expect(row.admin_unread).toBe(false);
      expect(row.coach_unread).toBe(true);
    });

    it("a reply moves the ticket to waiting_on_coach and flags it unread for the coach", async () => {
      await rlsAdmin.from("support_tickets").update({ coach_unread: false }).eq("id", ticketId);
      const sent = await reply(admin, ticketId, { body: "Which browser?" });
      expect(sent.error).toBeNull();
      expect(sent.data?.sender_role).toBe("admin");

      const row = await ticketRow(ticketId);
      expect(row.status).toBe("waiting_on_coach");
      expect(row.coach_unread).toBe(true);
      expect(row.admin_unread).toBe(false);
    });

    it("the coach's answer moves it back to open and flags it for the admin", async () => {
      expect((await coachA.client.rpc("support_mark_read", { p_ticket_id: ticketId })).error).toBeNull();
      expect((await reply(coachA, ticketId, { body: "Chrome" })).error).toBeNull();

      const row = await ticketRow(ticketId);
      expect(row.status).toBe("open");
      expect(row.coach_unread).toBe(false);
      expect(row.admin_unread).toBe(true);
    });

    it("an internal note is invisible to the coach and changes nothing on the ticket", async () => {
      const before = await ticketRow(ticketId);
      const note = await reply(admin, ticketId, { body: "Looks like a known bug", is_internal: true });
      expect(note.error).toBeNull();

      const after = await ticketRow(ticketId);
      expect(after.status).toBe(before.status);
      expect(after.coach_unread).toBe(before.coach_unread);
      expect(after.last_message_at).toBe(before.last_message_at);

      const seen = await coachA.client.from("ticket_messages").select("id").eq("id", note.data!.id);
      expect(seen.data ?? []).toHaveLength(0);
      const all = await coachA.client.from("ticket_messages").select("is_internal").eq("ticket_id", ticketId);
      expect(all.data?.every((row) => !row.is_internal)).toBe(true);
    });

    it("an internal note can't carry a file", async () => {
      const id = randomUUID();
      const withFile = await reply(admin, ticketId, {
        id,
        is_internal: true,
        attachment_paths: [`${coachA.userId}/${ticketId}/${id}/a.png`],
      });
      expect(withFile.error).not.toBeNull();
    });
  });

  describe("a closed ticket", () => {
    it("refuses the coach's reply, then reopens inside the window", async () => {
      const closed = await admin.client.from("support_tickets").update({ status: "closed" }).eq("id", ticketId);
      expect(closed.error).toBeNull();
      expect((await ticketRow(ticketId)).closed_at).not.toBeNull();

      expect((await reply(coachA, ticketId)).error).not.toBeNull();

      expect((await coachA.client.rpc("support_reopen_ticket", { p_ticket_id: ticketId })).error).toBeNull();
      const row = await ticketRow(ticketId);
      expect(row.status).toBe("open");
      expect(row.closed_at).toBeNull();
      expect(row.admin_unread).toBe(true);
    });

    it("can't be reopened after the window", async () => {
      const id = randomUUID();
      expect((await openTicket(coachA, { p_id: id })).error).toBeNull();
      // The trigger stamps closed_at when the status changes, so close first
      // and back-date it in a second update.
      await rlsAdmin.from("support_tickets").update({ status: "closed" }).eq("id", id);
      const old = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      const backdated = await rlsAdmin.from("support_tickets").update({ closed_at: old }).eq("id", id);
      expect(backdated.error).toBeNull();
      expect(new Date((await ticketRow(id)).closed_at!).getTime()).toBe(new Date(old).getTime());

      const reopened = await coachA.client.rpc("support_reopen_ticket", { p_ticket_id: id });
      expect(reopened.error?.hint).toBe("reopen_not_allowed");
    });
  });

  it("caps the number of open tickets per coach", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await openTicket(coachB)).error).toBeNull();
    }
    expect((await openTicket(coachB)).error?.hint).toBe("too_many_open");
  });

  describe("attachments", () => {
    const messageId = randomUUID();
    let path: string;

    beforeAll(() => {
      path = `${coachA.userId}/${ticketId}/${messageId}/${randomUUID()}.png`;
    });

    it("the owner uploads under their own folder and attaches it to that message", async () => {
      expect((await upload(coachA, path)).error).toBeNull();
      const sent = await reply(coachA, ticketId, { id: messageId, attachment_paths: [path] });
      expect(sent.error).toBeNull();

      const signed = await coachA.client.storage.from(BUCKET).createSignedUrl(path, 60);
      expect(signed.error).toBeNull();
    });

    it("a message can't name a file outside its own folder", async () => {
      const elsewhere = await reply(coachA, ticketId, { attachment_paths: [path] });
      expect(elsewhere.error?.hint).toBe("invalid_attachment");
    });

    it("the admin reads it and can upload into the coach's folder", async () => {
      expect((await admin.client.storage.from(BUCKET).createSignedUrl(path, 60)).error).toBeNull();
      const adminPath = `${coachA.userId}/${ticketId}/${randomUUID()}/${randomUUID()}.png`;
      expect((await upload(admin, adminPath)).error).toBeNull();
    });

    it("another coach, a team member and a client can't read it or upload there", async () => {
      for (const user of [coachB, member, client]) {
        expect((await user.client.storage.from(BUCKET).createSignedUrl(path, 60)).error).not.toBeNull();
        expect((await user.client.storage.from(BUCKET).download(path)).error).not.toBeNull();
        const theirs = `${coachA.userId}/${ticketId}/${randomUUID()}/${randomUUID()}.png`;
        expect((await upload(user, theirs)).error).not.toBeNull();
      }
    });

    it("a team member and a client can't use a folder named after themselves", async () => {
      for (const user of [member, client]) {
        const own = `${user.userId}/${randomUUID()}/${randomUUID()}/${randomUUID()}.png`;
        expect((await upload(user, own)).error).not.toBeNull();
      }
    });

    it("nobody overwrites or deletes a file", async () => {
      const overwrite = await coachA.client.storage.from(BUCKET).upload(path, png(), { upsert: true });
      expect(overwrite.error).not.toBeNull();

      // remove() reports success with an empty list when RLS hides the row.
      await coachA.client.storage.from(BUCKET).remove([path]);
      expect((await coachA.client.storage.from(BUCKET).createSignedUrl(path, 60)).error).toBeNull();
    });

    it("the bucket refuses other file types and anything over the size cap", async () => {
      const folder = `${coachA.userId}/${ticketId}/${randomUUID()}`;
      const text = new Blob(["hello"], { type: "text/plain" });
      expect((await upload(coachA, `${folder}/a.png`, text)).error).not.toBeNull();

      const big = new Blob([new Uint8Array(5_300_000)], { type: "image/png" });
      expect((await upload(coachA, `${folder}/b.png`, big)).error).not.toBeNull();
    });
  });

  // Last on purpose: it counts what everything above did to the first ticket.
  describe("notifications", () => {
    it("the coach hears about the admin's reply and status change, never an internal note", async () => {
      // One public reply and one explicit close. The note, the automatic move
      // to waiting_on_coach and the coach's own reopen add nothing here.
      expect(await notificationKinds(coachA.userId, ticketId)).toEqual(["support_admin_reply", "support_status_changed"]);
    });

    it("an admin hears about the new ticket, each coach reply and the reopen", async () => {
      const kinds = await notificationKinds(admin.userId, ticketId);
      expect(kinds.filter((kind) => kind === "support_ticket_created")).toHaveLength(1);
      expect(kinds.filter((kind) => kind === "support_ticket_reopened")).toHaveLength(1);
      // The coerced "admin" reply, the answer and the one with a file.
      expect(kinds.filter((kind) => kind === "support_coach_reply")).toHaveLength(3);
      expect(kinds).toHaveLength(5);
    });

    it("nobody else is told anything", async () => {
      for (const user of [coachB, member, client]) {
        expect(await notificationKinds(user.userId, ticketId)).toEqual([]);
      }
    });
  });
});
