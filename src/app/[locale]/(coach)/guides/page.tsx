import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { PageTitle } from "@/components/dashboard/page-title";
import { GUIDES } from "@/content/guides";
import type { AppLocale } from "@/domain/locale";

/** Short video walkthroughs of the coach app, one per area, in the viewer's
 * language. Static content: open to every coach and team member. */
export default async function GuidesPage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  const t = await getTranslations("guides");

  return (
    <div className="flex flex-col gap-5 max-md:pb-16">
      <PageTitle title={t("title")} />

      <header className="flex flex-col gap-1">
        <h1 className="text-3xl leading-9 font-semibold">{t("title")}</h1>
        <p className="text-base text-muted-foreground">{t("subtitle")}</p>
      </header>

      <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GUIDES.map((guide, i) => {
          const base = `/videos/guides/${guide.id}-${locale}`;
          return (
            <li key={guide.id}>
              <Card className="h-full gap-0 overflow-hidden py-0">
                <video
                  controls
                  preload="none"
                  playsInline
                  poster={`${base}.jpg`}
                  className="aspect-video w-full bg-black"
                  aria-label={t(`items.${guide.id}.title`)}
                >
                  <source src={`${base}.mp4`} type="video/mp4" />
                </video>
                <div className="flex flex-col gap-1 p-4">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{t("part", { n: i + 1, total: GUIDES.length })}</span>
                    <span>{t("duration", { seconds: guide.seconds })}</span>
                  </div>
                  <h2 className="text-base font-semibold">{t(`items.${guide.id}.title`)}</h2>
                  <p className="text-sm text-muted-foreground">{t(`items.${guide.id}.description`)}</p>
                </div>
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
