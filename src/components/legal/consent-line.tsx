import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const linkClass = "font-medium text-foreground underline underline-offset-4";

/** "By creating an account you agree to the Terms and Privacy Policy." Links
 * open in a new tab so the half-filled form isn't lost. */
export function ConsentLine({ messageKey }: { messageKey: "auth.signup.consent" | "join.form.consent" }) {
  const t = useTranslations();
  return (
    <p className="text-center text-xs leading-relaxed text-muted-foreground">
      {t.rich(messageKey, {
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
    </p>
  );
}
