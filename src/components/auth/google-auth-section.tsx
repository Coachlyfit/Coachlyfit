"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "@/i18n/navigation";
import { startGoogleAuthAction } from "@/app/[locale]/(auth)/actions";

type Intent = "login" | "signup" | "client_invite" | "team_invite";

// Error keys /auth/callback can put in `?error=`. Split by the namespace that
// owns the translation (invite errors already live in clients.errors).
const AUTH_ERRORS = [
  "oauth_cancelled",
  "oauth_failed",
  "no_account",
  "signups_closed",
  "confirmation_failed",
] as const;
const CLIENT_ERRORS = ["invalid_invite", "team_full", "team_wrong_email", "team_owns_business"] as const;

const linkClass = "font-medium text-foreground underline underline-offset-4";

/** Official multicolor Google "G" (Google Identity branding guidelines). */
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** "or" divider + (terms checkbox) + "Continue with Google". Signup and invite
 * intents require the terms tick before the button enables; login doesn't (an
 * unknown Google account is rejected in the callback, never created). */
export function GoogleAuthSection({
  locale,
  intent,
  inviteToken,
  next,
  error,
}: {
  locale: string;
  intent: Intent;
  inviteToken?: string;
  next?: string;
  /** `?error=` from the callback redirect; unknown values are ignored. */
  error?: string;
}) {
  const t = useTranslations("auth.google");
  const tAuthErrors = useTranslations("auth.errors");
  const tClientErrors = useTranslations("clients.errors");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  const needsConsent = intent !== "login";
  const errorKey = formError ?? error;
  const errorText = (AUTH_ERRORS as readonly string[]).includes(errorKey ?? "")
    ? tAuthErrors(errorKey!)
    : (CLIENT_ERRORS as readonly string[]).includes(errorKey ?? "")
      ? tClientErrors(errorKey!)
      : null;

  const onClick = () => {
    setFormError(null);
    startTransition(async () => {
      const result = await startGoogleAuthAction({
        intent,
        locale: locale === "en" ? "en" : "ar",
        next,
        inviteToken,
        termsAccepted: needsConsent ? agreed : undefined,
      });
      if (result?.error) setFormError(result.error === "invalid_input" ? "oauth_failed" : result.error);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 text-xs text-muted-foreground" role="separator">
        <span className="h-px flex-1 bg-border" />
        {t("or")}
        <span className="h-px flex-1 bg-border" />
      </div>

      {errorText && (
        <p role="alert" className="text-sm text-destructive">
          {errorText}
        </p>
      )}

      {needsConsent && (
        <div className="flex items-start gap-2">
          <Checkbox
            checked={agreed}
            onCheckedChange={(v) => setAgreed(v === true)}
            aria-labelledby="google-consent-label"
            className="mt-0.5"
          />
          <span id="google-consent-label" className="text-xs leading-relaxed text-muted-foreground">
            {t.rich("consent", {
              terms: (chunks) => (
                <Link href="/legal/terms" target="_blank" className={linkClass}>
                  {chunks}
                </Link>
              ),
              privacy: (chunks) => (
                <Link href="/legal/privacy" target="_blank" className={linkClass}>
                  {chunks}
                </Link>
              ),
            })}
          </span>
        </div>
      )}

      {/* Google branding: white (dark: #131314) surface, 1px neutral border, "G" + label. */}
      <button
        type="button"
        onClick={onClick}
        disabled={pending || (needsConsent && !agreed)}
        aria-busy={pending}
        className="flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-[#747775] bg-white px-3 text-sm font-medium text-[#1f1f1f] transition-colors hover:bg-[#f0f4f9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#8E918F] dark:bg-[#131314] dark:text-[#E3E3E3] dark:hover:bg-[#1f2023]"
      >
        {pending ? <Loader2Icon className="size-[18px] animate-spin" aria-hidden="true" /> : <GoogleG />}
        <span>{pending ? tCommon("pending") : t("continue")}</span>
      </button>
    </div>
  );
}
