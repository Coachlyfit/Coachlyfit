import { describe, expect, it } from "vitest";
import { attachmentFolder, attachmentsBelongTo, canReopen, isAttachmentMime } from "./support";

describe("attachmentsBelongTo", () => {
  const folder = attachmentFolder("coach-1", "ticket-1", "message-1");

  it("accepts files directly in the message's folder", () => {
    expect(attachmentsBelongTo([`${folder}a.png`, `${folder}b.webp`], folder)).toBe(true);
    expect(attachmentsBelongTo([], folder)).toBe(true);
  });

  it("refuses another message's, ticket's or coach's folder", () => {
    expect(attachmentsBelongTo(["coach-1/ticket-1/message-2/a.png"], folder)).toBe(false);
    expect(attachmentsBelongTo(["coach-1/ticket-2/message-1/a.png"], folder)).toBe(false);
    expect(attachmentsBelongTo(["coach-2/ticket-1/message-1/a.png"], folder)).toBe(false);
  });

  it("refuses a nested path, and one bad path spoils the list", () => {
    expect(attachmentsBelongTo([`${folder}nested/a.png`], folder)).toBe(false);
    expect(attachmentsBelongTo([`${folder}a.png`, "elsewhere/a.png"], folder)).toBe(false);
  });
});

describe("canReopen", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  it("allows a ticket closed inside the window", () => {
    expect(canReopen({ status: "closed", closed_at: "2026-10-07T12:00:00Z" }, now)).toBe(true);
  });

  it("refuses one closed 14 days ago or more", () => {
    expect(canReopen({ status: "closed", closed_at: "2026-10-06T12:00:00Z" }, now)).toBe(false);
    expect(canReopen({ status: "closed", closed_at: "2026-09-01T12:00:00Z" }, now)).toBe(false);
  });

  it("refuses a ticket that isn't closed", () => {
    expect(canReopen({ status: "open", closed_at: null }, now)).toBe(false);
    expect(canReopen({ status: "waiting_on_coach", closed_at: "2026-10-19T12:00:00Z" }, now)).toBe(false);
  });
});

describe("isAttachmentMime", () => {
  it("accepts the bucket's image types only", () => {
    expect(isAttachmentMime("image/png")).toBe(true);
    expect(isAttachmentMime("image/gif")).toBe(false);
    expect(isAttachmentMime("application/pdf")).toBe(false);
  });
});
