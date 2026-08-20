import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { SignupForm } from "./signup-form";
import { OtpForm } from "./otp-form";

export default async function SignupPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("auth.signup");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Tabs defaultValue="phone">
          <TabsList className="w-full">
            <TabsTrigger value="phone" className="flex-1">
              {t("phoneTab")}
            </TabsTrigger>
            <TabsTrigger value="email" className="flex-1">
              {t("emailTab")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="phone">
            <OtpForm locale={locale} />
          </TabsContent>
          <TabsContent value="email">
            <SignupForm locale={locale} />
          </TabsContent>
        </Tabs>
        <p className="text-center text-sm text-muted-foreground">
          {t("haveAccount")}{" "}
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            {t("loginLink")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
