import { INVOICE_DISPLAY_STATUSES, type InvoiceDisplayStatus } from "@/domain/billing/invoices";

// URL state of /finance (?tab=&status=). Lives here, not in finance-view.tsx:
// the server page validates the query params against these, and a value
// imported from a "use client" module is only a reference on the server.
export const FINANCE_TABS = ["invoices", "payments"] as const;
export type FinanceTab = (typeof FINANCE_TABS)[number];

export const STATUS_FILTERS = ["all", ...INVOICE_DISPLAY_STATUSES] as const;
export type StatusFilter = "all" | InvoiceDisplayStatus;
