import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MarketingService } from "@/domain/marketing/marketing.service";
import { SiteEditor } from "./site-editor";

/** The landing page's visual editor: section list, live preview, inspector.
 * Everything here is the draft; the public page only changes on Publish. */
export default async function AdminSitePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: slug = "home" } = await searchParams;
  const service = new MarketingService(await createClient());

  const pages = await service.listPages();
  const page = pages.find((p) => p.slug === slug);
  if (!page) notFound();

  const [sections, versions] = await Promise.all([service.getDraft(page.id), service.listVersions(page.id)]);

  return (
    <SiteEditor key={page.id} pages={pages} page={page} initialSections={sections} initialVersions={versions} />
  );
}
