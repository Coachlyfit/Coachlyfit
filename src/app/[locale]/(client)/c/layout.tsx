import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { roleHome } from "@/lib/auth/role-home";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { ClientNav } from "./client-nav";

export default async function ClientLayout({
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "client") redirect(roleHome(locale, profile?.role));

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-end gap-2 border-b border-border px-4 py-3">
        <LocaleSwitcher />
        <ThemeToggle />
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 p-4 pb-20">{children}</main>
      <ClientNav />
    </div>
  );
}
