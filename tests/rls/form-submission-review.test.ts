// mark_form_submission_reviewed (20261005000001_form_submission_review.sql)
// is the coach's only write path on form_submissions, and it's security
// definer -- so the function body, not RLS, is what stops coach B from
// clearing coach A's inbox, or a client from marking their own submission
// as reviewed. Both are worth proving rather than assuming.
import { beforeAll, describe, expect, it } from "vitest";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";

async function createCoach(tag: string) {
  return createRlsUser(`fsr-coach-${tag}`, {
    role: "coach",
    full_name: `Coach ${tag}`,
    business_name: `${tag} Fitness`,
    locale: "en",
  });
}

type User = Awaited<ReturnType<typeof createCoach>>;

let coachA: User;
let coachB: User;
let clientOfA: User;
let submissionId: string;

beforeAll(async () => {
  [coachA, coachB] = await Promise.all([createCoach("a"), createCoach("b")]);
  clientOfA = await createRlsUser("fsr-client-a1", { role: "client", full_name: "Client a1", locale: "en" });

  // Inserting the clients row starts the active coaching relationship
  // (clients_start_coaching_relationship) that the submission gets stamped with.
  const { data: clientRow, error: clientError } = await admin
    .from("clients")
    .insert({ coach_id: coachA.userId, profile_id: clientOfA.userId, display_name: "Client a1" })
    .select("id")
    .single();
  if (clientError) throw clientError;

  const { data: template, error: templateError } = await admin
    .from("form_templates")
    .insert({ coach_id: coachA.userId, kind: "checkin", name_ar: "تسجيل", name_en: "Check-in" })
    .select("id")
    .single();
  if (templateError) throw templateError;

  const { data: version, error: versionError } = await admin
    .from("form_template_versions")
    .insert({ coach_id: coachA.userId, template_id: template.id, version: 1, schema: { version: 1, fields: [] } })
    .select("id")
    .single();
  if (versionError) throw versionError;

  const { data: assignment, error: assignmentError } = await admin
    .from("form_assignments")
    .insert({ coach_id: coachA.userId, client_id: clientRow.id, template_version_id: version.id })
    .select("id")
    .single();
  if (assignmentError) throw assignmentError;

  const { data: submission, error: submissionError } = await admin
    .from("form_submissions")
    .insert({
      coach_id: coachA.userId,
      client_id: clientRow.id,
      assignment_id: assignment.id,
      template_version_id: version.id,
      answers: {},
    })
    .select("id, reviewed_at")
    .single();
  if (submissionError) throw submissionError;
  expect(submission.reviewed_at).toBeNull();
  submissionId = submission.id;
}, 60_000);

describe("mark_form_submission_reviewed: only the owning coach can review", () => {
  it("another coach cannot mark it", async () => {
    const { error } = await coachB.client.rpc("mark_form_submission_reviewed", { p_submission_id: submissionId });
    expect(error).not.toBeNull();
  });

  it("the client who submitted it cannot mark it", async () => {
    const { error } = await clientOfA.client.rpc("mark_form_submission_reviewed", { p_submission_id: submissionId });
    expect(error?.code).toBe("42501");
  });

  it("neither attempt changed the row", async () => {
    const { data } = await admin.from("form_submissions").select("reviewed_at").eq("id", submissionId).single();
    expect(data?.reviewed_at).toBeNull();
  });

  it("a coach has no direct UPDATE on the column", async () => {
    await coachA.client.from("form_submissions").update({ reviewed_at: new Date().toISOString() }).eq("id", submissionId);
    const { data } = await admin.from("form_submissions").select("reviewed_at").eq("id", submissionId).single();
    expect(data?.reviewed_at).toBeNull();
  });

  it("the owning coach marks it, and a second call keeps the first timestamp", async () => {
    const first = await coachA.client.rpc("mark_form_submission_reviewed", { p_submission_id: submissionId });
    expect(first.error).toBeNull();
    expect(first.data?.reviewed_by).toBe(coachA.userId);
    expect(first.data?.reviewed_at).toBeTruthy();

    const second = await coachA.client.rpc("mark_form_submission_reviewed", { p_submission_id: submissionId });
    expect(second.error).toBeNull();
    expect(second.data?.reviewed_at).toBe(first.data?.reviewed_at);
  });
});
