"use server";

import { createClient } from "@/lib/supabase/server";

// No coachId resolution beyond getUser() -- the coach_rw RLS policy on
// `clients` already scopes every plain select to the caller's own tenant,
// same as clients-table.tsx's server-side fetch. The explicit getUser()
// check isn't load-bearing for authorization (RLS returns zero rows to an
// anonymous caller regardless), but every other action in this app
// re-checks auth as its first statement -- this is the one action that
// didn't, which meant an unauthenticated POST reached the DB at all.
export async function searchClientsForPaletteAction(
  query: string
): Promise<{ id: string; display_name: string }[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("clients")
    .select("id, display_name")
    .ilike("display_name", `%${trimmed}%`)
    .order("display_name")
    .limit(8);

  return data ?? [];
}
