import { describe, expect, it } from "vitest";
import { FeedbackService, type NewFeedback } from "./feedback.service";
import { feedbackFolder } from "./feedback";

type Call = { op: string; args: unknown[] };

function fakeSupabase(opts: { signed?: unknown[] } = {}) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      return {
        insert: async (payload: unknown) => {
          calls.push({ op: "insert", args: [table, payload] });
          return { error: null };
        },
      };
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (paths: string[], expiresIn: number) => {
          calls.push({ op: "sign", args: [bucket, paths, expiresIn] });
          return { data: opts.signed ?? [], error: null };
        },
      }),
    },
  };
  return { db: db as never, calls };
}

const base: NewFeedback = {
  id: "f-1",
  authorId: "u-1",
  authorRole: "coach",
  coachId: "c-1",
  kind: "bug",
  rating: null,
  body: "Export is broken",
  screenshotPath: null,
};

describe("FeedbackService", () => {
  it("inserts a coach's feedback with the tenant id and the author", async () => {
    const { db, calls } = fakeSupabase();
    await new FeedbackService(db).create({ ...base, screenshotPath: "u-1/f-1/a.png" });
    expect(calls).toEqual([
      {
        op: "insert",
        args: [
          "feedback",
          {
            id: "f-1",
            author_id: "u-1",
            author_role: "coach",
            coach_id: "c-1",
            kind: "bug",
            rating: null,
            body: "Export is broken",
            screenshot_path: "u-1/f-1/a.png",
          },
        ],
      },
    ]);
  });

  it("inserts a client's rating with no coach and no comment", async () => {
    const { db, calls } = fakeSupabase();
    await new FeedbackService(db).create({
      ...base,
      authorRole: "client",
      coachId: null,
      kind: "rating",
      rating: 4,
      body: "   ",
    });
    expect(calls[0].args[1]).toMatchObject({ author_role: "client", coach_id: null, kind: "rating", rating: 4, body: null });
  });

  it("builds the screenshot folder from author and feedback ids", () => {
    expect(feedbackFolder("u-1", "f-1")).toBe("u-1/f-1/");
  });

  it("signs nothing when there are no screenshots", async () => {
    const { db, calls } = fakeSupabase();
    expect(await new FeedbackService(db).signScreenshots([])).toEqual({});
    expect(calls).toEqual([]);
  });

  it("maps signed urls by path and drops the ones that failed", async () => {
    const { db, calls } = fakeSupabase({
      signed: [
        { path: "a", signedUrl: "https://x/a" },
        { path: "b", signedUrl: null },
      ],
    });
    expect(await new FeedbackService(db).signScreenshots(["a", "b"])).toEqual({ a: "https://x/a" });
    expect(calls[0].args[0]).toBe("feedback-attachments");
  });
});
