import { redirect } from "next/navigation";

// The inbox moved to /messages; old bookmarks and notification links land here.
export default async function InboxRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/messages`);
}
