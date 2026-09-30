"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Resend } from "resend";
import { requireCoach } from "@/lib/auth/require-coach";
import { formatNumber } from "@/lib/format";
import { InvoiceError, InvoicesService } from "@/domain/billing/invoices.service";
import { renderInvoiceEmail } from "@/domain/billing/invoice-email";
import type { InvoiceCurrency } from "@/domain/billing/invoices";
import type { AppLocale } from "@/domain/locale";
import { invoiceDraftSchema, type InvoiceDraftInput } from "./schemas";

type ActionResult = { error: string } | void;

const idSchema = z.string().uuid();

// Same sender config as the notifications cron (api/cron/notifications).
const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "Coachly Fit <onboarding@resend.dev>";

/** Rule violations the UI explains; anything else (network, RLS no-op
 * surfacing as a DB error) collapses to save_failed. */
function toError(err: unknown): { error: string } {
  return { error: err instanceof InvoiceError ? err.code : "save_failed" };
}

function draftFields(data: InvoiceDraftInput) {
  return {
    currency: data.currency,
    tax_rate: data.tax_rate,
    issue_date: data.issue_date || null,
    due_date: data.due_date || null,
    notes: data.notes || null,
    items: data.items,
  };
}

function revalidateInvoice(locale: string, id: string) {
  revalidatePath(`/${locale}/invoices`);
  revalidatePath(`/${locale}/invoices/${id}`);
}

export async function createInvoiceAction(locale: string, input: unknown): Promise<ActionResult> {
  const parsed = invoiceDraftSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireCoach();
  if ("error" in auth) return auth;

  let id: string;
  try {
    const invoice = await new InvoicesService(auth.supabase).createManual(auth.coachId, {
      client_id: parsed.data.client_id,
      ...draftFields(parsed.data),
    });
    id = invoice.id;
  } catch (err) {
    return toError(err);
  }
  revalidatePath(`/${locale}/invoices`);
  redirect(`/${locale}/invoices/${id}`);
}

export async function createInvoiceFromTransactionAction(locale: string, transactionId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(transactionId).success) return { error: "invalid_input" };

  const auth = await requireCoach();
  if ("error" in auth) return auth;

  let id: string;
  try {
    const invoice = await new InvoicesService(auth.supabase).createFromTransaction(
      auth.coachId,
      transactionId,
      locale as AppLocale
    );
    id = invoice.id;
  } catch (err) {
    return toError(err);
  }
  revalidatePath(`/${locale}/invoices`);
  redirect(`/${locale}/invoices/${id}`);
}

export async function updateDraftAction(locale: string, id: string, input: unknown): Promise<ActionResult> {
  const parsed = invoiceDraftSchema.safeParse(input);
  if (!parsed.success || !idSchema.safeParse(id).success) return { error: "invalid_input" };

  const auth = await requireCoach();
  if ("error" in auth) return auth;

  try {
    await new InvoicesService(auth.supabase).updateDraft(id, draftFields(parsed.data));
  } catch (err) {
    return toError(err);
  }
  revalidateInvoice(locale, id);
}

export async function deleteDraftAction(locale: string, id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { error: "invalid_input" };

  const auth = await requireCoach();
  if ("error" in auth) return auth;

  try {
    await new InvoicesService(auth.supabase).deleteDraft(id);
  } catch (err) {
    return toError(err);
  }
  revalidatePath(`/${locale}/invoices`);
  redirect(`/${locale}/invoices`);
}

export async function issueInvoiceAction(
  locale: string,
  id: string
): Promise<{ error: string } | { invoiceNumber: string }> {
  if (!idSchema.safeParse(id).success) return { error: "invalid_input" };

  const auth = await requireCoach();
  if ("error" in auth) return auth;

  try {
    const invoice = await new InvoicesService(auth.supabase).issue(id);
    revalidateInvoice(locale, id);
    return { invoiceNumber: invoice.invoice_number ?? "" };
  } catch (err) {
    return toError(err);
  }
}

export async function markPaidAction(locale: string, id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { error: "invalid_input" };

  const auth = await requireCoach();
  if ("error" in auth) return auth;

  try {
    await new InvoicesService(auth.supabase).markPaid(id);
  } catch (err) {
    return toError(err);
  }
  revalidateInvoice(locale, id);
}

export async function voidInvoiceAction(locale: string, id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { error: "invalid_input" };

  const auth = await requireCoach();
  if ("error" in auth) return auth;

  try {
    await new InvoicesService(auth.supabase).void(id);
  } catch (err) {
    return toError(err);
  }
  revalidateInvoice(locale, id);
}

/** Emails the client a link to the invoice in their portal -- no PDF
 * attachment, the portal page is the printable document. Optional: without
 * RESEND_API_KEY the UI falls back to "copy link". */
export async function sendInvoiceEmailAction(
  locale: string,
  id: string
): Promise<{ error: string } | { email: string }> {
  if (!idSchema.safeParse(id).success) return { error: "invalid_input" };

  const auth = await requireCoach();
  if ("error" in auth) return auth;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: "email_not_configured" };

  const doc = await new InvoicesService(auth.supabase).getDocument(id);
  if (!doc) return { error: "not_found" };
  if (doc.invoice.status === "draft") return { error: "invalid_transition" };
  const email = doc.parties.client.email;
  if (!email) return { error: "no_client_email" };

  const appLocale = locale as AppLocale;
  const t = await getTranslations({ locale: appLocale, namespace: "invoices" });
  const values = {
    number: doc.invoice.invoice_number ?? "",
    business: doc.parties.seller.business_name,
    total: `${formatNumber(doc.invoice.total, appLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${t(`currency.${doc.invoice.currency as InvoiceCurrency}`)}`,
  };

  const { error } = await new Resend(apiKey).emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: t("email.subject", values),
    html: renderInvoiceEmail({
      locale: appLocale,
      body: t("email.body", values),
      cta: t("email.cta"),
      url: `${process.env.NEXT_PUBLIC_APP_URL}/${locale}/c/invoices/${id}`,
    }),
  });
  if (error) return { error: "send_failed" };
  return { email };
}
