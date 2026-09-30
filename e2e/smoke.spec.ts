import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

const LOCALES = ["ar", "en"] as const;
const PUBLIC_PATHS = ["", "/login", "/signup"];
const PROTECTED_PATHS = ["/dashboard", "/admin", "/c"];

const CRASH_TEXT = [
  "Application error",
  "This page could not be found",
  "Unhandled Runtime Error",
];

function trackFailures(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("requestfailed", (req) => {
    failedRequests.push(`${req.method()} ${req.url()}`);
  });
  return { consoleErrors, failedRequests };
}

for (const locale of LOCALES) {
  const dir = locale === "ar" ? "rtl" : "ltr";

  for (const path of PUBLIC_PATHS) {
    test(`public /${locale}${path} renders (${dir})`, async ({ page }) => {
      const { consoleErrors, failedRequests } = trackFailures(page);

      const response = await page.goto(`/${locale}${path}`);
      expect(response?.status(), "response status").toBeLessThan(400);

      const bodyText = await page.locator("body").innerText();
      for (const marker of CRASH_TEXT) {
        expect(bodyText, `page should not show "${marker}"`).not.toContain(marker);
      }

      await expect(page.locator("html")).toHaveAttribute("dir", dir);

      expect(consoleErrors, "console errors").toEqual([]);
      expect(failedRequests, "failed requests").toEqual([]);
    });
  }

  for (const path of PROTECTED_PATHS) {
    test(`protected /${locale}${path} redirects to login when logged out`, async ({ page }) => {
      const { consoleErrors } = trackFailures(page);

      const response = await page.goto(`/${locale}${path}`);
      expect(response?.status(), "response status").toBeLessThan(400);

      await expect(page).toHaveURL(new RegExp(`/${locale}/login$`));

      const bodyText = await page.locator("body").innerText();
      for (const marker of CRASH_TEXT) {
        expect(bodyText, `page should not show "${marker}"`).not.toContain(marker);
      }

      expect(consoleErrors, "console errors").toEqual([]);
    });
  }
}
