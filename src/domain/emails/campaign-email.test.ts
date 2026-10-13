import { describe, expect, it } from "vitest";
import { fillVariables, renderCampaignEmail, renderMarkdown } from "./campaign-email";

describe("renderMarkdown", () => {
  it("escapes HTML typed into the body", () => {
    const html = renderMarkdown(`<script>alert(1)</script> <img src=x onerror="alert(1)">`);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders headings, lists, bold, italic and line breaks", () => {
    const html = renderMarkdown("# Title\n\nHello **bold** and *soft*\nsecond line\n\n- one\n- two");
    expect(html).toContain(">Title</h2>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>soft</em>");
    expect(html).toContain("soft</em><br>second line");
    expect(html.match(/<li /g)).toHaveLength(2);
  });

  it("keeps http(s) and mailto links and drops any other scheme", () => {
    expect(renderMarkdown("[site](https://example.com/a?b=1&c=2)")).toContain('href="https://example.com/a?b=1&amp;c=2"');
    expect(renderMarkdown("[mail](mailto:a@example.com)")).toContain('href="mailto:a@example.com"');

    const unsafe = renderMarkdown("[click](javascript:alert(1))");
    expect(unsafe).not.toContain("href");
    expect(unsafe).toContain("click");
  });

  it("cannot break out of the href attribute", () => {
    const html = renderMarkdown(`[x](https://a.com/"onmouseover="alert(1))`);
    expect(html).not.toContain('"onmouseover="');
  });
});

describe("fillVariables", () => {
  it("replaces every {{coach_name}}, with or without inner spaces", () => {
    expect(fillVariables("Hi {{coach_name}} / {{ coach_name }}", "Sara")).toBe("Hi Sara / Sara");
  });
});

describe("renderCampaignEmail", () => {
  const base = { subject: "Hi {{coach_name}}", body: "Welcome {{coach_name}}", appUrl: "https://app.example.com/" };

  it("sets dir and lang from the direction", () => {
    expect(renderCampaignEmail({ ...base, direction: "rtl", coachName: "سارة" }).html).toContain('<html dir="rtl" lang="ar">');
    expect(renderCampaignEmail({ ...base, direction: "ltr", coachName: "Sara" }).html).toContain('<html dir="ltr" lang="en">');
  });

  it("fills the variable in subject and body and escapes the name in the HTML", () => {
    const { subject, html } = renderCampaignEmail({ ...base, direction: "ltr", coachName: "<b>Sara</b>" });
    expect(subject).toBe("Hi <b>Sara</b>");
    expect(html).toContain("Welcome &lt;b&gt;Sara&lt;/b&gt;");
    expect(html).not.toContain("<b>Sara</b>");
  });

  it("keeps the team footer unless an unsubscribe URL is given", () => {
    const coach = renderCampaignEmail({ ...base, direction: "ltr", coachName: "Sara" }).html;
    expect(coach).toContain("Sent by the Coachly Fit team.");
    expect(coach).not.toContain("Unsubscribe");

    const unsubscribeUrl = "https://app.example.com/en/unsubscribe?token=abc&x=1";
    const english = renderCampaignEmail({ ...base, direction: "ltr", coachName: "Sara", unsubscribeUrl }).html;
    expect(english).not.toContain("Sent by the Coachly Fit team.");
    expect(english).toContain('<a href="https://app.example.com/en/unsubscribe?token=abc&amp;x=1"');
    expect(english).toContain(">Unsubscribe</a>.");

    const arabic = renderCampaignEmail({ ...base, direction: "rtl", coachName: "سارة", unsubscribeUrl }).html;
    expect(arabic).toContain(">إلغاء الاشتراك</a>.");
  });

  it("builds an absolute logo URL from the app URL", () => {
    const { html } = renderCampaignEmail({ ...base, direction: "ltr", coachName: "Sara" });
    expect(html).toContain('src="https://app.example.com/brand/app-icon-192.png"');
  });
});
