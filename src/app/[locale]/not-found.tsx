import type { Metadata } from "next";
import NextLink from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { ErrorHeading, ErrorShell } from "@/components/error-pages/error-shell";
import { WeightPlate404 } from "@/components/error-pages/weight-plate-404";
import { BackButton } from "@/components/error-pages/back-button";
import { roleHome } from "@/lib/auth/role-home";
import { getViewerProfile } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.notFound");
  return { title: t("metaTitle") };
}

// Only links the viewer's role can actually open (see the route-group
// layout guards); signed-out visitors get none.
const QUICK_LINKS = {
  coach: [
    ["/clients", "clients"],
    ["/programs", "programs"],
    ["/inbox", "inbox"],
  ],
  client: [
    ["/c/plan", "plan"],
    ["/c/progress", "progress"],
    ["/c/coach", "coach"],
  ],
  admin: [
    ["/admin/requests", "requests"],
    ["/admin/online", "online"],
    ["/admin/feedback", "feedback"],
  ],
} as const;

export default async function NotFound() {
  const [t, tNav, locale, profile] = await Promise.all([
    getTranslations("common.notFound"),
    getTranslations("nav"),
    getLocale(),
    getViewerProfile().catch(() => null),
  ]);

  const role = profile?.role;
  const home = profile ? roleHome(locale, role) : `/${locale}/login`;
  const links = role === "admin" ? QUICK_LINKS.admin : role === "client" ? QUICK_LINKS.client : profile ? QUICK_LINKS.coach : [];

  return (
    <ErrorShell>
      <WeightPlate404 />
      <ErrorHeading title={t("title")} description={t("description")} />
      <div className="flex flex-wrap justify-center gap-2.5">
        <NextLink href={home} className={cn(buttonVariants(), "h-12 px-5 text-base")}>
          {t("backHome")}
        </NextLink>
        <BackButton label={t("back")} />
      </div>
      {links.length > 0 && (
        <nav
          aria-label={t("quickLinks")}
          className="mt-3 flex w-full flex-col gap-2.5 border-t border-border pt-5"
        >
          <span className="text-muted-foreground">{t("orGoTo")}</span>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
            {links.map(([href, key]) => (
              <NextLink
                key={href}
                href={`/${locale}${href}`}
                className="flex h-12 items-center justify-center rounded-[11px] bg-card font-medium ring-1 ring-foreground/10 hover:bg-accent"
              >
                {tNav(key)}
              </NextLink>
            ))}
          </div>
        </nav>
      )}
    </ErrorShell>
  );
}
