// Voice notes (20261021000001_voice_notes.sql): the file lives under the
// conversation's relationship id, and only that conversation's coach and
// client can put one there or read it back. Another client of the same
// coach, another coach and an admin all get nothing.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { createRlsUser, rlsAdmin } from "./rls-test-helpers";

type User = { userId: string; client: SupabaseClient<Database> };

const BUCKET = "voice-notes";
// EBML magic, so the bytes are what the content type says they are.
const webm = () => new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4])], { type: "audio/webm" });

let coachA: User;
let coachB: User;
let clientA1: User;
let clientA2: User;
let admin: User;
let clientA1Id: string;
let relationshipId: string;
let notePath: string;
let noteId: string;

async function createClientOf(coach: User, tag: string) {
  const user = await createRlsUser(`voice-client-${tag}`, { role: "client", full_name: tag, locale: "ar" });
  const { data, error } = await rlsAdmin
    .from("clients")
    .insert({ coach_id: coach.userId, display_name: tag, profile_id: user.userId })
    .select("id")
    .single();
  if (error) throw error;
  return { user, clientId: data.id };
}

function upload(user: User, path: string, file: Blob = webm()) {
  return user.client.storage.from(BUCKET).upload(path, file, { contentType: file.type });
}

function voiceRow(overrides: Record<string, unknown> = {}) {
  const id = randomUUID();
  return {
    id,
    coach_id: coachA.userId,
    client_id: clientA1Id,
    sender_role: "coach",
    kind: "voice",
    body: "",
    audio_path: `${relationshipId}/${id}.webm`,
    audio_mime: "audio/webm",
    audio_duration_sec: 5,
    audio_size_bytes: 8,
    ...overrides,
  };
}

beforeAll(async () => {
  [coachA, coachB, admin] = await Promise.all([
    createRlsUser("voice-coach-a", { role: "coach", full_name: "Coach A", business_name: "A Gym", locale: "ar" }),
    createRlsUser("voice-coach-b", { role: "coach", full_name: "Coach B", business_name: "B Gym", locale: "ar" }),
    createRlsUser("voice-admin", { role: "admin", full_name: "Admin", locale: "ar" }),
  ]);
  const [a1, a2] = await Promise.all([createClientOf(coachA, "a1"), createClientOf(coachA, "a2")]);
  clientA1 = a1.user;
  clientA2 = a2.user;
  clientA1Id = a1.clientId;

  const { data, error } = await rlsAdmin
    .from("coaching_relationships")
    .select("id")
    .eq("client_id", clientA1Id)
    .eq("status", "active")
    .single();
  if (error) throw error;
  relationshipId = data.id;

  noteId = randomUUID();
  notePath = `${relationshipId}/${noteId}.webm`;
}, 60_000);

describe("voice notes", () => {
  it("both participants can upload into their conversation and sign what's there", async () => {
    expect((await upload(coachA, notePath)).error).toBeNull();
    expect((await upload(clientA1, `${relationshipId}/${randomUUID()}.webm`)).error).toBeNull();

    for (const user of [coachA, clientA1]) {
      const signed = await user.client.storage.from(BUCKET).createSignedUrl(notePath, 60);
      expect(signed.error).toBeNull();
      expect(signed.data?.signedUrl).toBeTruthy();
    }
  });

  it("nobody outside the conversation can read or upload: same-coach client, other coach, admin", async () => {
    for (const user of [clientA2, coachB, admin]) {
      const signed = await user.client.storage.from(BUCKET).createSignedUrl(notePath, 60);
      expect(signed.error).not.toBeNull();
      const download = await user.client.storage.from(BUCKET).download(notePath);
      expect(download.error).not.toBeNull();
      expect((await upload(user, `${relationshipId}/${randomUUID()}.webm`)).error).not.toBeNull();
    }
  });

  it("a participant can't overwrite or delete a note", async () => {
    const overwrite = await coachA.client.storage.from(BUCKET).upload(notePath, webm(), { upsert: true });
    expect(overwrite.error).not.toBeNull();

    // remove() reports success with an empty list when RLS hides the row.
    await coachA.client.storage.from(BUCKET).remove([notePath]);
    const stillThere = await coachA.client.storage.from(BUCKET).createSignedUrl(notePath, 60);
    expect(stillThere.error).toBeNull();
  });

  it("the bucket refuses other file types and anything over the size cap", async () => {
    const text = new Blob(["hello"], { type: "text/plain" });
    expect((await upload(coachA, `${relationshipId}/${randomUUID()}.webm`, text)).error).not.toBeNull();

    const big = new Blob([new Uint8Array(600_000)], { type: "audio/webm" });
    expect((await upload(coachA, `${relationshipId}/${randomUUID()}.webm`, big)).error).not.toBeNull();
  });

  it("a voice row is accepted only in its exact shape", async () => {
    const good = await coachA.client.from("messages").insert(voiceRow({ id: noteId, audio_path: notePath }));
    expect(good.error).toBeNull();

    const bad = [
      voiceRow({ audio_duration_sec: 121 }),
      voiceRow({ audio_size_bytes: 600_000 }),
      voiceRow({ audio_mime: "audio/mpeg" }),
      voiceRow({ body: "hi" }),
      // Pointing at another message's file.
      voiceRow({ audio_path: `${relationshipId}/${randomUUID()}.webm` }),
      // A text message can't carry audio fields.
      voiceRow({ kind: "text", body: "hi" }),
    ];
    for (const row of bad) {
      expect((await coachA.client.from("messages").insert(row)).error).not.toBeNull();
    }

    // Text messages are untouched by the new constraint.
    const text = await coachA.client
      .from("messages")
      .insert({ coach_id: coachA.userId, client_id: clientA1Id, sender_role: "coach", body: "hi" });
    expect(text.error).toBeNull();
  });

  it("only the cron's service role can list files for deletion", async () => {
    const args = { p_before: new Date().toISOString(), p_orphan_before: new Date().toISOString(), p_limit: 10 };
    expect((await coachA.client.rpc("voice_notes_to_delete", args)).error).not.toBeNull();

    // p_before = now, so every file in the bucket is past "retention".
    const { data, error } = await rlsAdmin.rpc("voice_notes_to_delete", { ...args, p_limit: 1000 });
    expect(error).toBeNull();
    expect(data).toContain(notePath);
  });

  it("the inbox preview says the last message was a voice note", async () => {
    const voice = await clientA1.client.from("messages").insert(voiceRow({ sender_role: "client" }));
    expect(voice.error).toBeNull();
    const { data } = await coachA.client
      .from("coach_inbox_threads")
      .select("last_kind, last_body")
      .eq("client_id", clientA1Id)
      .single();
    expect(data).toEqual({ last_kind: "voice", last_body: "" });
  });
});
