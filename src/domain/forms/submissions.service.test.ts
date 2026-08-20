import { describe, expect, it } from "vitest";
import { SubmissionsService } from "./submissions.service";

function fakeSupabase(assignmentRow: Record<string, unknown>) {
  const inserts: { table: string; payload: unknown }[] = [];

  const db = {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: table === "form_assignments" ? assignmentRow : null,
              error: null,
            }),
          }),
        }),
        insert: (payload: unknown) => {
          inserts.push({ table, payload });
          return {
            select: () => ({
              single: async () => ({ data: { id: "submission-1", ...(payload as object) }, error: null }),
            }),
          };
        },
      };
    },
  };

  return { db: db as never, inserts };
}

describe("SubmissionsService.submit", () => {
  it("derives coach_id and template_version_id from the assignment, not the caller", async () => {
    const { db, inserts } = fakeSupabase({
      id: "assignment-1",
      coach_id: "real-coach",
      template_version_id: "real-version",
    });

    await new SubmissionsService(db).submit("client-1", "assignment-1", { q1: "answer" });

    const submissionInsert = inserts.find((i) => i.table === "form_submissions");
    expect(submissionInsert?.payload).toMatchObject({
      coach_id: "real-coach",
      client_id: "client-1",
      template_version_id: "real-version",
      assignment_id: "assignment-1",
      answers: { q1: "answer" },
    });
  });

  it("throws rather than submitting against a non-existent assignment", async () => {
    const { db } = fakeSupabase(null as never);
    await expect(new SubmissionsService(db).submit("client-1", "missing", {})).rejects.toThrow();
  });
});

function fakeSubmissionsQuery(row: Record<string, unknown> | null) {
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            neq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: row, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  };
  return db as never;
}

describe("SubmissionsService.getPreviousAnswers", () => {
  it("returns null on a first submission", async () => {
    const db = fakeSubmissionsQuery(null);
    const result = await new SubmissionsService(db).getPreviousAnswers(
      "client-1",
      "template-1",
      "assignment-2"
    );
    expect(result).toBeNull();
  });

  it("returns the prior submission's answers, excluding the current assignment", async () => {
    const db = fakeSubmissionsQuery({ answers: { weight: 85.6 } });
    const result = await new SubmissionsService(db).getPreviousAnswers(
      "client-1",
      "template-1",
      "assignment-2"
    );
    expect(result).toEqual({ weight: 85.6 });
  });
});
