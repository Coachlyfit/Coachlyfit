import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const PASSWORD = "Coachly-Test-2026!";

async function upsertUser(email: string, metadata: Record<string, unknown>) {
  const { data: existing } = await admin.auth.admin.listUsers();
  const found = existing.users.find((u) => u.email === email);
  if (found) {
    console.log(`exists: ${email} (${found.id})`);
    return found.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) throw error;
  console.log(`created: ${email} (${data.user.id})`);
  return data.user.id;
}

async function main() {
  const adminId = await upsertUser("admin@coachly.test", {
    role: "admin",
    full_name: "Coachly Admin",
    locale: "ar",
  });

  const coachId = await upsertUser("coach@coachly.test", {
    role: "coach",
    full_name: "Mona Test Coach",
    business_name: "Mona Fitness",
    locale: "ar",
  });

  const clientId = await upsertUser("client@coachly.test", {
    role: "client",
    full_name: "Sara Test Client",
    locale: "ar",
  });

  // Client signup normally goes through the invite flow (which links
  // profile_id after acceptance). For this fixture, link it directly with
  // the service-role client, which bypasses RLS by design.
  const { data: existingClient } = await admin
    .from("clients")
    .select("id")
    .eq("profile_id", clientId)
    .maybeSingle();

  if (!existingClient) {
    const { error } = await admin.from("clients").insert({
      coach_id: coachId,
      profile_id: clientId,
      display_name: "Sara Test Client",
      email: "client@coachly.test",
      status: "active",
    });
    if (error) throw error;
    console.log("linked client to coach");
  } else {
    console.log("client already linked to coach");
  }

  console.log("\nDone. Password for all three: " + PASSWORD);
  console.log("admin@coachly.test  ->", adminId);
  console.log("coach@coachly.test  ->", coachId);
  console.log("client@coachly.test ->", clientId);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
