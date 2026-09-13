import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

/** Every admin server action must call this first. The (admin) layout
 * guard does NOT cover server actions -- a server action is an
 * individually addressable POST endpoint. RLS and the definer functions
 * are the real authority; this just fails fast with a usable message. */
export async function requireAdmin(): Promise<
  { supabase: SupabaseClient<Database>; userId: string; error?: never } | { supabase?: never; userId?: never; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: "forbidden" };

  return { supabase, userId: user.id };
}
