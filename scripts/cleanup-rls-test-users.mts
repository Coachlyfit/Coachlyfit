// One-off cleanup: the RLS test suite (tests/rls/*.test.ts) creates real
// auth users with @example.test emails against whatever project
// NEXT_PUBLIC_SUPABASE_URL points to, with no teardown. If that env pointed
// at the hosted project instead of `supabase start`, those runs leaked real
// coach/gym/client rows into prod. Deleting the auth.users row cascades
// (profiles -> coaches -> clients -> everything keyed off coach/profile id),
// so this only needs to delete auth users, not walk every table.
//
// Usage: npx tsx scripts/cleanup-rls-test-users.mts [--dry-run]
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const TEST_EMAIL_SUFFIX = "@example.test";
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const toDelete: { id: string; email: string }[] = [];

  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    if (data.users.length === 0) break;

    for (const u of data.users) {
      if (u.email?.endsWith(TEST_EMAIL_SUFFIX)) {
        toDelete.push({ id: u.id, email: u.email });
      }
    }
    if (data.users.length < 1000) break;
  }

  console.log(`found ${toDelete.length} test user(s) matching *${TEST_EMAIL_SUFFIX}`);
  for (const u of toDelete) console.log(`  ${u.email}`);

  if (dryRun) {
    console.log("dry run, nothing deleted");
    return;
  }

  let failed = 0;
  for (const u of toDelete) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) {
      failed++;
      console.error(`  FAILED ${u.email}: ${error.message}`);
    }
  }
  console.log(`deleted ${toDelete.length - failed}/${toDelete.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
