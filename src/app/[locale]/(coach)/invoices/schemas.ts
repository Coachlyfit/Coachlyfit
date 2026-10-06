import { z } from "zod";
import { INVOICE_CURRENCIES } from "@/domain/billing/invoices";

const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal(""));

export const invoiceLineSchema = z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.coerce.number().positive().max(100_000),
  unit_price: z.coerce.number().min(0).max(100_000_000),
});

export const invoiceDraftSchema = z.object({
  client_id: z.string().uuid(),
  currency: z.enum(INVOICE_CURRENCIES),
  tax_rate: z.coerce.number().min(0).max(100),
  issue_date: optionalDate,
  due_date: optionalDate,
  notes: z.string().max(2000).optional().or(z.literal("")),
  items: z.array(invoiceLineSchema).min(1).max(100),
});

// z.coerce.number() splits input (what RHF's number inputs hand over) from
// output -- same split as clients/schemas.ts's RecordTransactionFormInput.
export type InvoiceDraftFormInput = z.input<typeof invoiceDraftSchema>;
export type InvoiceDraftInput = z.output<typeof invoiceDraftSchema>;

export const recordPaymentSchema = z.object({
  invoice_id: z.string().uuid(),
  payment_method_id: z.string().uuid(),
  paid_on: optionalDate,
  proof_path: z.string().max(300).optional().or(z.literal("")),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
