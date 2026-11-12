import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResumeWorkoutLink } from "@/components/offline/resume-workout-link";

// Served by the service worker (public/sw.js) when a navigation fails and no
// cached copy of the requested page exists. Static on purpose: it must be
// precachable without a signed-in user.
export default async function OfflinePage() {
  const t = await getTranslations("offline.page");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResumeWorkoutLink />
      </CardContent>
    </Card>
  );
}
