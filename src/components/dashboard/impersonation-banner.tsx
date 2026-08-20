import { UserCog } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { signOutAction } from "@/lib/auth/sign-out-action";

/** Shown only while the `impersonating` cookie is set (see
 * /auth/confirm/route.ts) — a display hint, not a security boundary. The
 * real audit trail is impersonation_log, written by begin_impersonation()
 * before this session ever existed. "Sign out" is the return path — there's
 * no session-swap-back, the admin logs in again afterward. */
export async function ImpersonationBanner({ locale, fullName }: { locale: string; fullName: string }) {
  const t = await getTranslations("admin.impersonation");

  return (
    <div className="flex items-center gap-2.5 bg-warning px-4 py-2 text-sm font-medium text-warning-foreground">
      <UserCog className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{t("banner", { name: fullName })}</span>
      <form action={signOutAction.bind(null, locale)}>
        <button type="submit" className="underline underline-offset-2 hover:no-underline">
          {t("stop")}
        </button>
      </form>
    </div>
  );
}
