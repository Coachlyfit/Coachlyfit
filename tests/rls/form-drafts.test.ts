// form_drafts (20261110000001_form_drafts.sql): a client's private, resumable
// answers for one pending assignment. The policies are the whole boundary --
// a client must only reach their own drafts, only while the assignment is
// pending, and a coach must never see them. Submitting must also clear the
// draft and be one-per-assignment (the unique index behind idempotent submit).
import { beforeAll, describe, expect, it } from "vitest";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";

type User = Awaited<ReturnType<typeof createRlsUser>>;

let coach: User;
let client1: User;
let client2: User;
let client1RowId: string;
let client2RowId: string;
let versionId: string;
let pendingId: string; // client1, pending
let completedId: string; // client1, already completed
let submitId: string; // client1, pending, used for the submit tests

async function assign(clientRowId: string, status: "pending" | "completed" = "pending") {
  const { data, error } = await admin
    .from("form_assignments")
    .insert({ coach_id: coach.userId, client_id: clientRowId, template_version_id: versionId, status })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

beforeAll(async () => {
  coach = await createRlsUser("fd-coach", {
    role: "coach",
    full_name: "Coach fd",
    business_name: "fd Fitness",
    locale: "en",
  });
  [client1, client2] = await Promise.all([
    createRlsUser("fd-client-1", { role: "client", full_name: "Client 1", locale: "en" }),
    createRlsUser("fd-client-2", { role: "client", full_name: "Client 2", locale: "en" }),
  ]);

  const rows = await Promise.all(
    [client1, client2].map(async (c, i) => {
      const { data, error } = await admin
        .from("clients")
        .insert({ coach_id: coach.userId, profile_id: c.userId, display_name: `Client ${i + 1}` })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    })
  );
  [client1RowId, client2RowId] = rows;

  const { data: template, error: templateError } = await admin
    .from("form_templates")
    .insert({ coach_id: coach.userId, kind: "checkin", name_ar: "تسجيل", name_en: "Check-in" })
    .select("id")
    .single();
  if (templateError) throw templateError;
  const { data: version, error: versionError } = await admin
    .from("form_template_versions")
    .insert({ coach_id: coach.userId, template_id: template.id, version: 1, schema: { version: 1, fields: [] } })
    .select("id")
    .single();
  if (versionError) throw versionError;
  versionId = version.id;

  pendingId = await assign(client1RowId);
  completedId = await assign(client1RowId, "completed");
  submitId = await assign(client1RowId);
}, 60_000);

describe("form_drafts: a client's own pending assignment", () => {
  it("the owner can save and read back a draft", async () => {
    const { error } = await client1.client.from("form_drafts").upsert(
      { assignment_id: pendingId, client_id: client1RowId, answers: { q1: "a" }, current_field_id: "q1" },
      { onConflict: "assignment_id" }
    );
    expect(error).toBeNull();

    const { data } = await client1.client.from("form_drafts").select("answers, current_field_id").eq("assignment_id", pendingId);
    expect(data).toEqual([{ answers: { q1: "a" }, current_field_id: "q1" }]);
  });

  it("the owner can update it (second autosave)", async () => {
    const { error } = await client1.client.from("form_drafts").upsert(
      { assignment_id: pendingId, client_id: client1RowId, answers: { q1: "b" }, current_field_id: "q2" },
      { onConflict: "assignment_id" }
    );
    expect(error).toBeNull();
    const { data } = await admin.from("form_drafts").select("answers").eq("assignment_id", pendingId).single();
    expect(data?.answers).toEqual({ q1: "b" });
  });
});

describe("form_drafts: nobody else can reach it", () => {
  it("another client sees none of it", async () => {
    const { data } = await client2.client.from("form_drafts").select("assignment_id").eq("assignment_id", pendingId);
    expect(data).toEqual([]);
  });

  it("another client cannot write a draft onto someone else's assignment", async () => {
    // Own client_id on a foreign assignment, and the foreign client_id: both refused.
    const own = await client2.client
      .from("form_drafts")
      .insert({ assignment_id: submitId, client_id: client2RowId, answers: {} });
    expect(own.error).not.toBeNull();
    const spoofed = await client2.client
      .from("form_drafts")
      .insert({ assignment_id: submitId, client_id: client1RowId, answers: {} });
    expect(spoofed.error).not.toBeNull();
  });

  it("another client cannot overwrite or delete the existing draft", async () => {
    await client2.client.from("form_drafts").update({ answers: { hacked: true } }).eq("assignment_id", pendingId);
    await client2.client.from("form_drafts").delete().eq("assignment_id", pendingId);
    const { data } = await admin.from("form_drafts").select("answers").eq("assignment_id", pendingId).single();
    expect(data?.answers).toEqual({ q1: "b" });
  });

  it("the coach cannot read drafts", async () => {
    const { data } = await coach.client.from("form_drafts").select("assignment_id").eq("assignment_id", pendingId);
    expect(data).toEqual([]);
  });
});

describe("form_drafts: only while the assignment is pending", () => {
  it("a draft cannot be created on a completed assignment", async () => {
    const { error } = await client1.client
      .from("form_drafts")
      .insert({ assignment_id: completedId, client_id: client1RowId, answers: {} });
    expect(error).not.toBeNull();
  });
});

describe("submitting: clears the draft and is one per assignment", () => {
  it("a submission completes the assignment and deletes the draft", async () => {
    const draft = await client1.client
      .from("form_drafts")
      .insert({ assignment_id: submitId, client_id: client1RowId, answers: { q1: "x" } });
    expect(draft.error).toBeNull();

    const submit = await client1.client.from("form_submissions").insert({
      coach_id: coach.userId,
      client_id: client1RowId,
      assignment_id: submitId,
      template_version_id: versionId,
      answers: { q1: "x" },
    });
    expect(submit.error).toBeNull();

    const { data: drafts } = await admin.from("form_drafts").select("assignment_id").eq("assignment_id", submitId);
    expect(drafts).toEqual([]);
    const { data: assignment } = await admin.from("form_assignments").select("status").eq("id", submitId).single();
    expect(assignment?.status).toBe("completed");
  });

  it("a second submission for the same assignment is rejected (unique index)", async () => {
    const again = await client1.client.from("form_submissions").insert({
      coach_id: coach.userId,
      client_id: client1RowId,
      assignment_id: submitId,
      template_version_id: versionId,
      answers: { q1: "y" },
    });
    expect(again.error?.code).toBe("23505");
  });
});
