import { redirect } from "next/navigation";

// The invoice list moved to /finance. ?status= and ?client= carry over so
// old filtered links keep working; /invoices/new and /invoices/[invoiceId]
// are unchanged.
export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; client?: string }>;
}) {
  const { locale } = await params;
  const { status, client } = await searchParams;
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (client) query.set("client", client);
  redirect(`/${locale}/finance${query.size ? `?${query}` : ""}`);
}
