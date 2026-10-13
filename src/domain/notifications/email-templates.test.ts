import { describe, expect, it } from "vitest";
import { notificationName, notificationUrl, renderNotificationEmail } from "./email-templates";

describe("renderNotificationEmail", () => {
  it("interpolates the promoted item's name into the body", () => {
    const { subject, html } = renderNotificationEmail("en", "exercise_promoted", "Sara", "Barbell Squat");
    expect(subject).toBe("An exercise you added is now in the global library");
    expect(html).toContain("Barbell Squat");
    expect(html).toContain("Hi Sara,");
  });

  it("renders Arabic with dir=rtl and Arabic copy", () => {
    const { html } = renderNotificationEmail("ar", "food_promoted", null, "أرز بني");
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("أرز بني");
    expect(html).toContain("مرحبًا,");
  });

  it("new_message has fixed copy regardless of the name argument", () => {
    const { html } = renderNotificationEmail("en", "new_message", "Sara", null);
    expect(html).toContain("You have a new message waiting.");
  });

  it("client_left tells the old coach the subscription was canceled", () => {
    const { subject, html } = renderNotificationEmail("en", "client_left", null, null);
    expect(subject).toBe("A client moved to another coach");
    expect(html).toContain("Their subscription with you was canceled.");
  });
});

describe("subscription notices", () => {
  const kinds = [
    "subscription_trial_ending",
    "subscription_renewal_due",
    "subscription_past_due",
    "subscription_canceled",
  ] as const;

  it.each(kinds)("%s renders in both languages with the account footer", (kind) => {
    const en = renderNotificationEmail("en", kind, "Sara", "Aug 3, 2026");
    expect(en.subject).toContain("Coachly Fit");
    expect(en.html).toContain("sent regardless of your notification settings");
    expect(en.html).not.toContain("You can turn them off in Settings");

    const ar = renderNotificationEmail("ar", kind, null, "3 أغسطس 2026");
    expect(ar.html).toContain('dir="rtl"');
    expect(ar.html).toContain("بغض النظر عن إعدادات الإشعارات");
    expect(ar.subject).not.toBe(en.subject);
  });

  it("puts the period end date in the reminder, and reads fine without one", () => {
    expect(renderNotificationEmail("en", "subscription_trial_ending", null, "Aug 3, 2026").html).toContain(
      "Your trial ends on Aug 3, 2026."
    );
    expect(renderNotificationEmail("en", "subscription_trial_ending", null, null).html).toContain("Your trial ends soon.");
  });

  it("formats the date from the payload and links to the subscription page", () => {
    const payload = { period_end: "2026-08-03T00:00:00Z" };
    expect(notificationName("subscription_renewal_due", payload, "en")).toContain("2026");
    expect(notificationName("subscription_renewal_due", {}, "en")).toBeNull();
    expect(notificationUrl("subscription_past_due", payload, "ar")).toBe("/ar/settings/subscription");
  });
});

describe("task notices", () => {
  it("carry the task title and link to the tasks page", () => {
    const payload = { task_id: "t1", title: "Call new leads" };
    expect(notificationName("task_assigned", payload, "en")).toBe("Call new leads");
    expect(notificationUrl("task_completed", payload, "ar")).toBe("/ar/tasks");
    expect(renderNotificationEmail("en", "task_assigned", "Sara", "Call new leads").html).toContain(
      'A task was assigned to you: "Call new leads".'
    );
  });

  it("escape a title before it goes into the email body", () => {
    const { html } = renderNotificationEmail("en", "task_assigned", "<b>Sara</b>", '<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>Sara</b>");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
});

describe("support notices", () => {
  const kinds = [
    "support_ticket_created",
    "support_coach_reply",
    "support_ticket_reopened",
    "support_admin_reply",
    "support_status_changed",
  ] as const;

  it.each(kinds)("%s renders the ticket subject in both languages", (kind) => {
    const subject = notificationName(kind, { subject: "Export <b>broken</b>" }, "en");
    expect(subject).toBe("Export <b>broken</b>");

    const en = renderNotificationEmail("en", kind, "Sara", subject);
    expect(en.subject).toBeTruthy();
    expect(en.html).toContain("Export &lt;b&gt;broken&lt;/b&gt;");

    const ar = renderNotificationEmail("ar", kind, null, subject);
    expect(ar.html).toContain('dir="rtl"');
    expect(ar.subject).not.toBe(en.subject);
  });

  it("links admins to the inbox and the coach to their own ticket", () => {
    const payload = { ticket_id: "t-1" };
    expect(notificationUrl("support_ticket_created", payload, "ar")).toBe("/ar/admin/support/t-1");
    expect(notificationUrl("support_coach_reply", payload, "en")).toBe("/en/admin/support/t-1");
    expect(notificationUrl("support_ticket_reopened", payload, "en")).toBe("/en/admin/support/t-1");
    expect(notificationUrl("support_admin_reply", payload, "en")).toBe("/en/support/t-1");
    expect(notificationUrl("support_status_changed", payload, "ar")).toBe("/ar/support/t-1");
  });
});
