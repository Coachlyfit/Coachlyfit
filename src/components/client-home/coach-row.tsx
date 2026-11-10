import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { bold } from "./num";

/** Dashed footer row: who the client trains with, plus a way to their
 * invoices once the coach has issued one (RLS only lets them see their own
 * non-draft invoices, so a zero count means nothing to link to). */
export async function CoachRow({ businessName, hasInvoices }: { businessName: string; hasInvoices: boolean }) {
  const t = await getTranslations("client.overview");
  const tInvoices = await getTranslations("client.invoices");

  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-[14px] border border-dashed border-border px-3.5 py-3 text-sm">
      <span className="min-w-0 truncate">{t.rich("trainingWith", { name: businessName, b: bold })}</span>
      {hasInvoices && (
        <Link href="/c/invoices" className="shrink-0 font-medium text-primary">
          {tInvoices("link")}
        </Link>
      )}
    </div>
  );
}
