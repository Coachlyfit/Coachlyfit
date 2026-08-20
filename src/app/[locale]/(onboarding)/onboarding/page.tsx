import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { OnboardingClient } from "./onboarding-client";

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("onboarding");

  const steps = [
    t("steps.trainingMode"),
    t("steps.import"),
    t("steps.mapping"),
    t("steps.template"),
    t("steps.send"),
    t("steps.done"),
  ];

  return <OnboardingClient locale={locale} steps={steps} />;
}
