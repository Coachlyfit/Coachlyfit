import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { roleHome } from "@/lib/auth/role-home";

/** Deliberately bare -- no Sidebar/Topbar/BottomNav, unlike (coach)/layout.tsx.
 * A print page is a standalone document a coach opens in a new tab to hand
 * to the browser's print dialog; the app chrome would just print alongside
 * it. Keeps the same role guard as (coach)/layout.tsx (getUser + role check)
 * but skips the onboarding-completed redirect -- a coach without a completed
 * onboarding has no programs/diet plans to print, so it is moot here. */
export default async function PrintLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "coach") redirect(roleHome(locale, profile?.role));

  return <div className="mx-auto max-w-2xl bg-white p-8 text-black print:p-0">{children}</div>;
}
