import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { roleHome } from "@/lib/auth/role-home";
import { signOutAction } from "@/lib/auth/sign-out-action";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
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
  const t = await getTranslations("common");

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
      <header className="mx-auto flex w-full max-w-lg items-center justify-end gap-2 border-b border-border px-4 py-3">
        <LocaleSwitcher />
        <ThemeToggle />
        <form action={signOutAction.bind(null, locale)}>
          <Button type="submit" variant="outline" size="icon-sm" aria-label={t("signOut")}>
            <LogOut className="size-4" />
          </Button>
        </form>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 p-4 pb-20">{children}</main>
      <ClientNav />
    </div>
  );
}
