import { notFound } from "next/navigation";
import { hasLocale, type AbstractIntlMessages } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { PageTitle } from "@/components/dashboard/page-title";
import { WebsiteEditorShell } from "@/components/website-editor/website-editor-shell";
import { ResultsService } from "@/domain/sites/results.service";
import { ReviewsService } from "@/domain/sites/reviews.service";
import { SitesService } from "@/domain/sites/sites.service";
import { guardColors } from "@/domain/sites/theme";
import { routing } from "@/i18n/routing";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { getBranding } from "@/lib/branding";
import { siteUrl } from "@/lib/sites/origin";
import { createClient } from "@/lib/supabase/server";

export default async function WebsitePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("websiteEditor");

  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  if (!coachId) notFound();

  // A failure here throws to error.tsx (Retry + Contact support).
  const sites = new SitesService(supabase);
  const site = await sites.getOrCreate(coachId);
  const [coach, branding, cards, reviews, clients, arMessages, enMessages] = await Promise.all([
    supabase.from("coaches").select("business_name, slug").eq("id", coachId).single(),
    getBranding(),
    new ResultsService(supabase).list(coachId, site.id),
    new ReviewsService(supabase).list(coachId),
    supabase
      .from("clients")
      .select("id, display_name")
      .eq("coach_id", coachId)
      .is("deleted_at", null)
      .neq("status", "archived")
      .order("display_name"),
    getMessages({ locale: "ar" }),
    getMessages({ locale: "en" }),
  ]);
  if (coach.error) throw coach.error;
  if (clients.error) throw clients.error;

  const slug = coach.data.slug;
  const url = siteUrl({ domain: site.domain, coach: { slug } }, { lang: locale });
  const fallbackUrl = siteUrl({ domain: null, coach: { slug } }, { lang: locale });

  return (
    <>
      <PageTitle title={t("title")} />
      <WebsiteEditorShell
        locale={locale}
        initial={{
          draft: site.draft,
          published: site.published,
          publishedAt: site.publishedAt,
          isLive: site.isPublished,
          domain: site.domain,
          domainState: site.domain ? site.domainStatus : "none",
        }}
        coach={{
          id: coachId,
          name: coach.data.business_name,
          logoUrl: branding?.logoUrl ?? null,
          colors: guardColors(branding?.primary, branding?.accent),
          siteUrl: url,
          fallbackUrl,
          displayHost: new URL(url).host,
        }}
        cards={cards}
        reviews={reviews}
        clients={clients.data.map((c) => ({ id: c.id, name: c.display_name }))}
        siteMessages={{
          ar: arMessages.site as AbstractIntlMessages,
          en: enMessages.site as AbstractIntlMessages,
        }}
      />
    </>
  );
}
