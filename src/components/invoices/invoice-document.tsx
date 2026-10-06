import { useTranslations } from "next-intl";
import type { Database } from "@/lib/supabase/database.types";
import type { InvoiceCurrency, InvoiceParties } from "@/domain/billing/invoices";
import type { AppLocale } from "@/domain/locale";
import { formatDate, formatNumber } from "@/lib/format";

// Only the columns the sheet prints, so the settings live preview can feed it
// a sample invoice without inventing a full row.
type Invoice = Pick<
  Database["public"]["Tables"]["invoices"]["Row"],
  | "status"
  | "currency"
  | "invoice_number"
  | "issue_date"
  | "due_date"
  | "subtotal"
  | "tax_rate"
  | "tax"
  | "total"
  | "notes"
>;
type InvoiceItem = Pick<
  Database["public"]["Tables"]["invoice_items"]["Row"],
  "id" | "description" | "quantity" | "unit_price" | "line_total"
>;

/** The invoice as a document -- one component for the coach's detail page,
 * the client portal, the print route and the settings live preview, so what
 * the client sees is what prints. Not async and no server-only imports, so it
 * renders on either side of the client boundary. Always a white "paper" sheet regardless of app theme. Direction
 * comes from <html dir> (ar -> RTL); the layout is all logical properties,
 * so Arabic and English mirror without a separate template. Free text the
 * coach typed (names, address, lines, notes) is wrapped in <bdi> so an
 * Arabic line inside an English invoice (or vice versa) keeps its own
 * direction and punctuation; contact values (phone, email) are forced LTR
 * so "+20 ..." doesn't reorder inside RTL. */
export function InvoiceDocument({
  invoice,
  items,
  parties,
  logoUrl,
  locale,
}: {
  invoice: Invoice;
  items: InvoiceItem[];
  parties: InvoiceParties;
  logoUrl: string | null;
  locale: AppLocale;
}) {
  const t = useTranslations("invoices.document");
  const tCurrency = useTranslations("invoices.currency");
  const currency = tCurrency(invoice.currency as InvoiceCurrency);
  const money = (value: number) =>
    formatNumber(value, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const { seller, client } = parties;
  const stamp = invoice.status === "paid" ? t("paidStamp") : invoice.status === "void" ? t("voidStamp") : null;

  return (
    <article className="relative overflow-hidden rounded-lg bg-white p-6 text-sm text-neutral-900 shadow-sm ring-1 ring-black/10 sm:p-10 print:rounded-none print:p-0 print:shadow-none print:ring-0">
      {stamp && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute end-6 top-28 -rotate-12 rounded-md border-4 px-4 py-1 text-2xl font-bold uppercase tracking-widest opacity-70 ${
            invoice.status === "paid" ? "border-green-700 text-green-700" : "border-red-700 text-red-700"
          }`}
        >
          {stamp}
        </div>
      )}

      <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between print:flex-row print:items-start print:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- public storage URL, arbitrary host/size; next/image adds nothing on a print sheet.
            <img src={logoUrl} alt={seller.business_name} className="mb-2 h-14 w-auto max-w-48 object-contain" />
          )}
          <p className="text-base font-semibold">
            <bdi>{seller.business_name}</bdi>
          </p>
          {seller.address && (
            <p className="whitespace-pre-line text-neutral-600">
              <bdi>{seller.address}</bdi>
            </p>
          )}
          {(seller.contact_phone || seller.contact_email) && (
            <p className="flex flex-wrap gap-x-3 text-neutral-600">
              {seller.contact_phone && <span dir="ltr">{seller.contact_phone}</span>}
              {seller.contact_email && <span dir="ltr">{seller.contact_email}</span>}
            </p>
          )}
          {seller.tax_number && <p className="text-neutral-600">{t("taxNumber", { number: seller.tax_number })}</p>}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:text-end print:text-end">
          <h1 className="text-2xl font-semibold">{invoice.status === "draft" ? t("draftHeading") : t("heading")}</h1>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 sm:justify-end print:justify-end">
            {invoice.invoice_number && (
              <>
                <dt className="text-neutral-500">{t("number")}</dt>
                <dd className="font-mono font-medium">{invoice.invoice_number}</dd>
              </>
            )}
            {invoice.issue_date && (
              <>
                <dt className="text-neutral-500">{t("issueDate")}</dt>
                <dd className="font-mono">{formatDate(invoice.issue_date, locale)}</dd>
              </>
            )}
            {invoice.due_date && (
              <>
                <dt className="text-neutral-500">{t("dueDate")}</dt>
                <dd className="font-mono">{formatDate(invoice.due_date, locale)}</dd>
              </>
            )}
          </dl>
        </div>
      </header>

      <div className="my-6 h-0.5 bg-neutral-900" />

      <section className="mb-6 flex flex-col gap-0.5">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{t("billTo")}</p>
        <p className="font-semibold">
          <bdi>{client.display_name}</bdi>
        </p>
        {client.email && (
          <p className="text-neutral-600">
            <span dir="ltr">{client.email}</span>
          </p>
        )}
        {client.phone && (
          <p className="text-neutral-600">
            <span dir="ltr">{client.phone}</span>
          </p>
        )}
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-neutral-300 text-neutral-500">
            <th className="py-2 text-start font-medium">{t("description")}</th>
            <th className="py-2 text-end font-medium">{t("quantity")}</th>
            <th className="py-2 text-end font-medium">{t("unitPrice")}</th>
            <th className="py-2 text-end font-medium">{t("amount")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-neutral-200 align-top break-inside-avoid">
              <td className="py-2.5 pe-4">
                <bdi>{item.description}</bdi>
              </td>
              <td className="py-2.5 ps-2 text-end font-mono tabular-nums">{formatNumber(item.quantity, locale)}</td>
              <td className="py-2.5 ps-2 text-end font-mono tabular-nums">{money(item.unit_price)}</td>
              <td className="py-2.5 ps-2 text-end font-mono tabular-nums">{money(item.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ms-auto mt-4 grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 break-inside-avoid">
        <dt className="text-neutral-600">{t("subtotal")}</dt>
        <dd className="text-end font-mono tabular-nums">{money(invoice.subtotal)}</dd>
        {invoice.tax_rate > 0 && (
          <>
            <dt className="text-neutral-600">{t("tax", { rate: formatNumber(invoice.tax_rate, locale) })}</dt>
            <dd className="text-end font-mono tabular-nums">{money(invoice.tax)}</dd>
          </>
        )}
        <div className="col-span-2 my-1 border-t border-neutral-900" />
        <dt className="font-semibold">{t("total")}</dt>
        <dd className="text-end font-mono text-base font-semibold tabular-nums">
          {money(invoice.total)} <span className="text-xs">{currency}</span>
        </dd>
      </dl>

      {invoice.notes && (
        <section className="mt-8 break-inside-avoid">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{t("notes")}</p>
          <p className="mt-1 whitespace-pre-line text-neutral-700">
            <bdi>{invoice.notes}</bdi>
          </p>
        </section>
      )}
    </article>
  );
}
