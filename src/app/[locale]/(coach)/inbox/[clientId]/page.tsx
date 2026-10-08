import { redirect } from "next/navigation";

export default async function InboxThreadRedirect({
  params,
}: {
  params: Promise<{ locale: string; clientId: string }>;
}) {
  const { locale, clientId } = await params;
  redirect(`/${locale}/messages/${clientId}`);
}
