import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

// Same env order as vitest.config.mts: .env.local, then .env.test.local wins.
config({ path: ".env.local" });
config({ path: ".env.test.local", override: true });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const PASSWORD = "correct horse battery staple";

// Seeds real auth users on whatever Supabase project the env points at (as
// tests/rls does), so it only runs when that env is present. Every row is
// removed in afterAll by deleting the two users (cascades).
test.skip(!URL || !SECRET, "Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (a throwaway or local project).");

type Seed = { coachId: string; coachEmail: string; clientId: string; clientEmail: string; clientRowId: string; admin: SupabaseClient };
let seed: Seed;

async function createUser(admin: SupabaseClient, tag: string, metadata: Record<string, unknown>) {
  const email = `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: metadata });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  return { id: data.user.id, email };
}

test.beforeAll(async () => {
  const admin = createClient(URL!, SECRET!, { auth: { autoRefreshToken: false, persistSession: false } });

  const coach = await createUser(admin, "coach", { role: "coach", full_name: "E2E Coach", business_name: "E2E Fitness", locale: "en" });
  const { data: elite } = await admin.from("subscription_tiers").select("id").eq("key", "elite").limit(1).single();
  await admin.from("subscriptions").update({ tier_id: elite!.id }).eq("coach_id", coach.id);

  // A client account is created as a coach with team_invite, then flipped, like tests/rls does.
  const client = await createUser(admin, "client", { role: "coach", team_invite: true, full_name: "E2E Client", locale: "en" });
  await admin.from("profiles").update({ role: "client" }).eq("id", client.id);
  const { data: row, error } = await admin
    .from("clients")
    .insert({ coach_id: coach.id, profile_id: client.id, display_name: "E2E Client" })
    .select("id")
    .single();
  if (error) throw error;

  // Open every day, all day, no notice: the test picks any date without caring about the weekday or the clock.
  await admin.from("coach_availability").insert(
    Array.from({ length: 7 }, (_, weekday) => ({ coach_id: coach.id, weekday, start_time: "00:00", end_time: "23:00", timezone: "Africa/Cairo" }))
  );
  await admin.from("coach_appointment_settings").upsert({ coach_id: coach.id, cancel_cutoff_hours: 12, slot_minutes: 60, min_notice_hours: 0 });

  seed = { coachId: coach.id, coachEmail: coach.email, clientId: client.id, clientEmail: client.email, clientRowId: row.id, admin };
});

test.afterAll(async () => {
  if (!seed) return;
  const { admin, coachId, clientId } = seed;
  await Promise.all([admin.auth.admin.deleteUser(coachId), admin.auth.admin.deleteUser(clientId)]);
});

async function signIn(page: Page, email: string, home: RegExp) {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(home);
}

/** A date two days out, as YYYY-MM-DD in the browser's own zone (what the date picker works in). */
function inTwoDays() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test("client requests a session, coach confirms it", async ({ browser }) => {
  // --- client requests a free slot -------------------------------------
  const clientPage = await (await browser.newContext()).newPage();
  await signIn(clientPage, seed.clientEmail, /\/en\/c$/);
  await clientPage.goto("/en/c/appointments");
  await clientPage.getByRole("button", { name: "Request a session" }).click();

  const dialog = clientPage.getByRole("dialog");
  await dialog.locator("#req_date").click();
  // react-day-picker marks each day cell with its ISO date.
  await clientPage.locator(`[data-day="${inTwoDays()}"] button`).click();
  await clientPage.keyboard.press("Escape");

  const firstSlot = dialog.locator("button[aria-pressed]").first();
  await expect(firstSlot).toBeVisible();
  await firstSlot.click();
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect(clientPage.getByText("Request sent to your coach")).toBeVisible();

  await expect
    .poll(async () => {
      const { data } = await seed.admin.from("appointments").select("status").eq("client_id", seed.clientRowId);
      return data?.map((a) => a.status);
    })
    .toEqual(["requested"]);

  // --- coach confirms --------------------------------------------------
  const coachPage = await (await browser.newContext()).newPage();
  await signIn(coachPage, seed.coachEmail, /\/en\/dashboard/);
  await coachPage.goto("/en/schedule");
  await coachPage.getByRole("button", { name: /E2E Client/ }).first().click();
  await coachPage.getByRole("button", { name: "Confirm" }).click();
  await expect(coachPage.getByText("Session confirmed")).toBeVisible();

  await expect
    .poll(async () => {
      const { data } = await seed.admin.from("appointments").select("status").eq("client_id", seed.clientRowId);
      return data?.map((a) => a.status);
    })
    .toEqual(["confirmed"]);

  // --- client sees it confirmed ----------------------------------------
  await clientPage.reload();
  await expect(clientPage.getByText("Confirmed")).toBeVisible();
});
