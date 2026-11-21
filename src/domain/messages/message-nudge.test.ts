import { describe, expect, it } from "vitest";
import { dueNudges, nudgeEmailHtml } from "./message-nudge";

const now = new Date("2026-11-28T12:00:00Z");
const row = (over: Partial<Parameters<typeof dueNudges>[0][number]> = {}) => ({
  client_id: "cl1",
  coach_id: "co1",
  first_unread_at: "2026-11-28T10:30:00Z", // 90 min ago
  email_sent: false,
  ...over,
});

describe("dueNudges", () => {
  it("is due once the coach's delay has passed", () => {
    expect(dueNudges([row()], new Map([["co1", 60]]), now)).toHaveLength(1);
  });

  it("waits while the delay hasn't passed", () => {
    expect(dueNudges([row()], new Map([["co1", 120]]), now)).toHaveLength(0);
  });

  it("is due exactly at the delay", () => {
    expect(dueNudges([row({ first_unread_at: "2026-11-28T11:00:00Z" })], new Map([["co1", 60]]), now)).toHaveLength(1);
  });

  it("skips a window that was already emailed", () => {
    expect(dueNudges([row({ email_sent: true })], new Map([["co1", 30]]), now)).toHaveLength(0);
  });

  it("skips a coach who turned nudges off or isn't known", () => {
    expect(dueNudges([row()], new Map([["co1", null]]), now)).toHaveLength(0);
    expect(dueNudges([row()], new Map(), now)).toHaveLength(0);
  });
});

describe("nudgeEmailHtml", () => {
  const args = {
    dir: "ltr" as const,
    intro: "Unread",
    clientLabel: "Client",
    clientName: "<b>Sara</b>",
    sinceLabel: "First unread",
    since: "Sat 10:30",
    buttonLabel: "View Message",
    url: "https://x.test/en/messages/abc",
    footer: "Turn this off in settings.",
  };

  it("links to the conversation and escapes the client's name", () => {
    const html = nudgeEmailHtml(args);
    expect(html).toContain('href="https://x.test/en/messages/abc"');
    expect(html).toContain("View Message");
    expect(html).toContain("&lt;b&gt;Sara&lt;/b&gt;");
    expect(html).not.toContain("<b>Sara</b>");
  });
});
