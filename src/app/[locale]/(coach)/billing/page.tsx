import { redirect } from "next/navigation";

// /billing was the coach's own Coachly Fit subscription; that now lives at
// /settings/subscription, and the sidebar entry became /finance. Old links
// and bookmarks land on the page that replaced the nav item.
export default async function BillingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/finance`);
}
