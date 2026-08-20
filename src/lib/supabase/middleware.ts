import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

// Refreshes the Supabase auth cookie on every request. Server Actions and
// Server Components only read cookies — they can't refresh an expired
// access token themselves — so without this, sessions silently die after
// the token's ~1hr expiry and every server-side getUser() starts returning
// null (surfaced to users as "not_authenticated" on actions like check-in).
// https://supabase.com/docs/guides/auth/server-side/nextjs#update-the-middleware
export async function updateSession(request: NextRequest, response: NextResponse) {
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // Must call getUser() (not getSession()) — this is what actually
  // contacts Supabase to validate/refresh the token server-side.
  await supabase.auth.getUser();

  return response;
}
