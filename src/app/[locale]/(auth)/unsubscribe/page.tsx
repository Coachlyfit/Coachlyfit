import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { leadUnsubscribe } from "@/domain/leads/unsubscribe";
import { confirmUnsubscribeAction } from "./actions";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Where the unsubscribe link in an outreach email lands. Opening it changes
 * nothing -- mail scanners follow links -- the visitor has to press the button. */
export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { locale } = await params;
  const { token: rawToken } = await searchParams;
  const token = typeof rawToken === "string" ? rawToken : "";
  const t = await getTranslations("unsubscribe");

  const state = await leadUnsubscribe(await createClient(), token, false);

  if (state !== "active") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t(`${state}.title`)}</CardTitle>
          <CardDescription>{t(`${state}.body`)}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("active.title")}</CardTitle>
        <CardDescription>{t("active.body")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={confirmUnsubscribeAction.bind(null, locale, token)}>
          <Button type="submit" className="w-full">
            {t("active.confirm")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
