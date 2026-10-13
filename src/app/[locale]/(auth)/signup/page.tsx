import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getPlatformSettings } from "@/lib/platform-settings";
import { ConsentLine } from "@/components/legal/consent-line";
import { SignupForm } from "./signup-form";
import { OtpForm } from "./otp-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr ? "إنشاء حساب" : "Sign up",
    description: isAr
      ? "ابدأ تجربتك المجانية مع Coachlyfit — نماذج، برامج، متابعات وفواتير."
      : "Start your free trial with Coachlyfit — forms, programs, check-ins and invoices.",
  };
}

export default async function SignupPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("auth.signup");
  const settings = await getPlatformSettings();

  if (!settings.platform.signups_enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("closedTitle")}</CardTitle>
          <CardDescription>{t("closedBody")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

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
        <ConsentLine messageKey="auth.signup.consent" />
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
