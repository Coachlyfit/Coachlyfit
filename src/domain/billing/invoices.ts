export const INVOICE_STATUSES = ["draft", "issued", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_CURRENCIES = ["EGP", "SAR", "AED"] as const;
export type InvoiceCurrency = (typeof INVOICE_CURRENCIES)[number];

export type InvoiceLineInput = { description: string; quantity: number; unit_price: number };

/** Seller header + bill-to, frozen onto the invoice by issue_invoice()
 * (see 20260929000001_invoices.sql). Drafts have no snapshot and render the
 * coach's/client's live rows in the same shape. */
export type InvoiceParties = {
  seller: {
    business_name: string;
    logo_path: string | null;
    address: string | null;
    tax_number: string | null;
    contact_phone: string | null;
    contact_email: string | null;
  };
  client: { display_name: string; email: string | null; phone: string | null };
};

// toPrecision(15) first: 1.005 * 100 is 100.49999999999999 in floating
// point, which a bare Math.round would take down to 1.00.
function round2(value: number): number {
  return Math.round(Number((value * 100).toPrecision(15))) / 100;
}

/** Each line rounds on its own, then subtotal sums the rounded lines -- so
 * the printed lines always add up to the printed subtotal. Tax is a single
 * percentage on the subtotal. */
export function calculateTotals(items: InvoiceLineInput[], taxRate: number) {
  const lines = items.map((item) => ({ ...item, line_total: round2(item.quantity * item.unit_price) }));
  const subtotal = round2(lines.reduce((sum, line) => sum + line.line_total, 0));
  const tax = round2((subtotal * taxRate) / 100);
  return { lines, subtotal, tax, total: round2(subtotal + tax) };
}

// Same table as private.guard_invoice_change() -- the DB is the real
// enforcement, this just lets the UI and service fail early and show only
// the actions that will work.
const TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  draft: ["issued"],
  issued: ["paid", "void"],
  paid: ["void"],
  void: [],
};

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isEditable(status: InvoiceStatus): boolean {
  return status === "draft";
}
