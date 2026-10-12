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
