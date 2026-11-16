import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { GoogleAuthSection } from "@/components/auth/google-auth-section";
import { LoginForm } from "./login-form";

/** The login card itself, split from the page so the settings live preview
 * renders the same thing clients get. */
export function LoginCard({
  locale,
  google,
}: {
  locale: string;
  /** Real login page only: the settings preview renders the card without it. */
  google?: { error?: string };
}) {
  const t = useTranslations("auth.login");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <LoginForm locale={locale} />
        {google && <GoogleAuthSection locale={locale} intent="login" error={google.error} />}
        <p className="text-center text-sm text-muted-foreground">
          {t("noAccount")}{" "}
          <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
            {t("signUpLink")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
