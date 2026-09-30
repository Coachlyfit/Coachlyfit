import { describe, expect, it } from "vitest";
import { renderNotificationEmail } from "./email-templates";

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
