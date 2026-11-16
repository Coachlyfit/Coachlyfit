import { expect, test, type Page } from "@playwright/test";

// "Continue with Google": only our side of the redirect is exercised. The
// Supabase /auth/v1/authorize endpoint is intercepted, so Google is never hit.
// Needs NEXT_PUBLIC_SUPABASE_URL in the app's env (signInWithOAuth builds the
// authorize URL locally; no network call to Supabase happens).

const LABEL = { en: "Continue with Google", ar: "المتابعة باستخدام Google" } as const;

async function stubAuthorize(page: Page) {
  await page.route("**/auth/v1/authorize**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>stub provider</body></html>" })
  );
}

for (const locale of ["ar", "en"] as const) {
  test.describe(`google oauth (${locale})`, () => {
    test("login: button redirects to the Supabase authorize URL for google", async ({ page, context }) => {
      await stubAuthorize(page);
      await page.goto(`/${locale}/login`);

      const authorize = page.waitForRequest((r) => r.url().includes("/auth/v1/authorize"));
      await page.getByRole("button", { name: LABEL[locale] }).click();
      const url = new URL((await authorize).url());

      expect(url.searchParams.get("provider")).toBe("google");
      expect(url.searchParams.get("redirect_to")).toMatch(/\/auth\/callback$/);
      expect(url.searchParams.get("code_challenge")).toBeTruthy(); // PKCE

      // The intent travels in an httpOnly cookie scoped to /auth, not in the URL.
      const cookie = (await context.cookies()).find((c) => c.name === "oauth_intent");
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.path).toBe("/auth");
      expect(decodeURIComponent(cookie!.value)).toContain('"intent":"login"');
    });

    test("signup: button stays disabled until the terms are ticked", async ({ page }) => {
      await stubAuthorize(page);
      await page.goto(`/${locale}/signup`);

      const button = page.getByRole("button", { name: LABEL[locale] });
      await expect(button).toBeDisabled();

      await page.getByRole("checkbox").click();
      await expect(button).toBeEnabled();

      const authorize = page.waitForRequest((r) => r.url().includes("/auth/v1/authorize"));
      await button.click();
      expect(new URL((await authorize).url()).searchParams.get("provider")).toBe("google");
    });

    test("login: a cancelled consent screen shows a translated error", async ({ page }) => {
      await page.goto(`/${locale}/login?error=oauth_cancelled`);
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(page.getByRole("alert")).not.toContainText("oauth_cancelled");
    });

    test("unknown error codes are ignored", async ({ page }) => {
      await page.goto(`/${locale}/login?error=<script>alert(1)</script>`);
      await expect(page.getByRole("alert")).toHaveCount(0);
    });
  });
}

test("the callback refuses an open redirect through next on /auth/confirm", async ({ request }) => {
  const res = await request.get("/auth/confirm?code=bogus&next=//evil.example", { maxRedirects: 0 });
  expect(res.headers()["location"] ?? "").not.toContain("evil.example");
});
