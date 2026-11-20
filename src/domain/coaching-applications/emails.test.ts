import { describe, expect, it } from "vitest";
import { coachNotificationHtml, welcomeHtml } from "./emails";

describe("application emails", () => {
  it("escapes applicant-controlled text and skips empty rows", () => {
    const html = coachNotificationHtml({
      dir: "ltr",
      intro: "New",
      rows: [["Name", "<script>x</script>"], ["Message", "  "]],
      openLabel: "Open",
      openUrl: "https://a.test/x?a=1&b=2",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("Message");
    expect(html).toContain("a=1&amp;b=2");
  });

  it("welcome email carries the join link and rtl dir", () => {
    const html = welcomeHtml({ dir: "rtl", greeting: "Hi", body: "b", joinLabel: "Join", joinUrl: "https://s.test/join/t" });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("https://s.test/join/t");
  });
});
