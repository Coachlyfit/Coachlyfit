"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function signOutAction(locale: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Belt-and-suspenders for the impersonation banner: sign-out is the
  // primary "I'm done" moment, so clear it here rather than only relying on
  // its own expiry — a stale "1" left in the browser must never survive
  // into whoever logs in next on this device.
  (await cookies()).delete("impersonating");
  redirect(`/${locale}/login`);
}
