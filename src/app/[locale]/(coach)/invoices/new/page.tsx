import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/dashboard/page-title";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import type { InvoiceCurrency } from "@/domain/billing/invoices";

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client } = await searchParams;
  const t = await getTranslations("invoices");
  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  if (!coachId) notFound();

  const [{ data: clients }, { data: coach }] = await Promise.all([
    supabase.from("clients").select("id, display_name").neq("status", "archived").order("display_name"),
    supabase.from("coaches").select("default_currency, default_tax_rate").eq("id", coachId).single(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("new")} />
      <InvoiceForm
        clients={clients ?? []}
        defaultValues={{
          client_id: clients?.some((c) => c.id === client) ? client! : "",
          currency: (coach?.default_currency ?? "EGP") as InvoiceCurrency,
          tax_rate: coach?.default_tax_rate ?? 0,
          issue_date: "",
          due_date: "",
          notes: "",
          items: [{ description: "", quantity: 1, unit_price: 0 }],
        }}
      />
    </div>
  );
}
