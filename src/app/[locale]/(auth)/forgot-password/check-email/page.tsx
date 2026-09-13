import { useTranslations } from "next-intl";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordCheckEmailPage() {
  const t = useTranslations("auth.forgotPassword.checkEmail");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>
    </Card>
  );
}
