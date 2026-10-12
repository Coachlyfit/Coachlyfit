import { redirect } from "next/navigation";
import { getAuthUser, getViewerProfile } from "@/lib/auth/session";
import { roleHome } from "@/lib/auth/role-home";

/** Admin pages that take the whole screen (the site editor and the page it
 * previews in an iframe). Same role guard as the (admin) layout, without its
 * sidebar, topbar and padding. As there, this does NOT cover the server
 * actions: they re-check the role themselves. */
export default async function AdminEditorLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const user = await getAuthUser();
  if (!user) redirect(`/${locale}/login`);

  const profile = await getViewerProfile();
  if (profile?.role !== "admin") redirect(roleHome(locale, profile?.role));

  return <div className="min-h-dvh bg-background text-foreground">{children}</div>;
}
