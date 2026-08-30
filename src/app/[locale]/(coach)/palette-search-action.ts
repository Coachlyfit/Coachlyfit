"use server";

import { createClient } from "@/lib/supabase/server";

// No coachId resolution here -- the coach_rw RLS policy on `clients`
// already scopes every plain select to the caller's own tenant, same as
// clients-table.tsx's server-side fetch.
export async function searchClientsForPaletteAction(
  query: string
): Promise<{ id: string; display_name: string }[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("id, display_name")
    .ilike("display_name", `%${trimmed}%`)
    .order("display_name")
    .limit(8);

  return data ?? [];
}
