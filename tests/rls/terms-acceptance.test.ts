// handle_new_user() records the legal version a signup accepted, and only
// when it is a well-formed date (20261023000002).
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { rlsAdmin, trackRlsUser } from "./rls-test-helpers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function signUp(tag: string, terms_version?: string) {
  const visitor = createClient<Database>(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await visitor.auth.signUp({
    email: `terms-${tag}-${Date.now()}@example.test`,
    password: "Test-password-123!",
    options: { data: { role: "coach", full_name: "T", locale: "en", ...(terms_version && { terms_version }) } },
  });
  expect(error).toBeNull();
  trackRlsUser(data.user!.id);
  const { data: profile } = await rlsAdmin
    .from("profiles")
    .select("terms_version, terms_accepted_at")
    .eq("id", data.user!.id)
    .single();
  return profile!;
}

describe("terms acceptance at signup", () => {
  it("stores the version and a timestamp", async () => {
    const p = await signUp("ok", "2026-10-13");
    expect(p.terms_version).toBe("2026-10-13");
    expect(p.terms_accepted_at).not.toBeNull();
  });

  it("leaves both null when no version is sent", async () => {
    const p = await signUp("none");
    expect(p).toEqual({ terms_version: null, terms_accepted_at: null });
  });

  it("ignores a malformed version instead of failing the signup", async () => {
    const p = await signUp("bad", "yesterday");
    expect(p).toEqual({ terms_version: null, terms_accepted_at: null });
  });
});
