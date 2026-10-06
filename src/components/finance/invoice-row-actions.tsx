"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Ban, Download, FileText, HandCoins, Link2, MoreHorizontal, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { InvoiceDisplayStatus } from "@/domain/billing/invoices";
import {
  deleteDraftAction,
  issueInvoiceAction,
  markPaidAction,
  sendInvoiceEmailAction,
  voidInvoiceAction,
} from "@/app/[locale]/(coach)/invoices/actions";
import { RecordPaymentDialog, type PayableInvoice, type PaymentMethodOption } from "./record-payment-dialog";

type Confirming = "issue" | "void" | "delete" | null;

/** The one next step an invoice's state calls for (draft -> issue, issued ->
 * record payment, overdue -> remind; paid/void -> nothing), plus -- in the
 * table -- the PDF link and the rest behind "more". `card` is the mobile
 * layout: just the next step, full width; everything else is one tap away on
 * the invoice itself. */
export function InvoiceRowActions({
  invoice,
  status,
  hasPayment,
  coachId,
  paymentMethods,
  layout,
}: {
  invoice: PayableInvoice;
  status: InvoiceDisplayStatus;
  /** Created from a recorded payment: paying it is a status flip, not a second payment. */
  hasPayment: boolean;
  coachId: string;
  paymentMethods: PaymentMethodOption[];
  layout: "row" | "card";
}) {
  const t = useTranslations("finance.actions");
  const tInvoices = useTranslations("invoices");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [paying, setPaying] = useState(false);

  function run(action: () => Promise<{ error: string } | object | void>, onSuccess?: (result: object | void) => void) {
    startTransition(async () => {
      const result = await action();
      setConfirming(null);
      if (result && "error" in result) {
        toast.error(tInvoices(`errors.${result.error}`));
        return;
      }
      onSuccess?.(result);
    });
  }

  function pay() {
    if (hasPayment) run(() => markPaidAction(locale, invoice.id), () => toast.success(t("paid")));
    else setPaying(true);
  }

  function remind() {
    run(
      () => sendInvoiceEmailAction(locale, invoice.id),
      (result) => toast.success(t("reminded", { email: (result as { email: string }).email }))
    );
  }

  function copyLink() {
    navigator.clipboard
      .writeText(`${window.location.origin}/${locale}/c/invoices/${invoice.id}`)
      .then(() => toast.success(tInvoices("actions.linkCopied")));
  }

  const next = {
    draft: { label: t("issue"), onClick: () => setConfirming("issue") },
    issued: { label: t("recordPayment"), onClick: pay },
    overdue: { label: t("remind"), onClick: remind },
    paid: null,
    void: null,
  }[status];

  const confirmCopy = {
    issue: {
      title: tInvoices("confirm.issueTitle"),
      body: tInvoices("confirm.issueBody"),
      label: tInvoices("actions.issue"),
      variant: "default" as const,
    },
    void: {
      title: tInvoices("confirm.voidTitle"),
      body: tInvoices("confirm.voidBody"),
      label: tInvoices("actions.void"),
      variant: "destructive" as const,
    },
    delete: {
      title: tInvoices("confirm.deleteTitle"),
      body: tInvoices("confirm.deleteBody"),
      label: tInvoices("actions.delete"),
      variant: "destructive" as const,
    },
  };

  function onConfirm() {
    if (confirming === "issue") {
      run(
        () => issueInvoiceAction(locale, invoice.id),
        (result) =>
          toast.success(tInvoices("actions.issued", { number: (result as { invoiceNumber: string }).invoiceNumber }))
      );
    } else if (confirming === "void") {
      run(() => voidInvoiceAction(locale, invoice.id));
    } else if (confirming === "delete") {
      run(() => deleteDraftAction(locale, invoice.id));
    }
  }

  const nextButton = next && (
    <Button
      type="button"
      variant="outline"
      size={layout === "card" ? "default" : "sm"}
      className={cn("whitespace-nowrap", layout === "card" && "w-full")}
      onClick={next.onClick}
      disabled={pending}
    >
      {next.label}
    </Button>
  );

  return (
    <>
      {layout === "card" ? (
        nextButton
      ) : (
        <div className="flex items-center justify-end gap-1.5">
          {nextButton}
          <a
            href={`/${locale}/print/invoice/${invoice.id}`}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label={t("pdf", { number: invoice.number })}
          >
            <Download className="size-4" aria-hidden="true" />
          </a>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" variant="ghost" size="icon" aria-label={t("more", { number: invoice.number })} />
              }
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem render={<Link href={`/invoices/${invoice.id}`} />}>
                <FileText className="size-4" />
                {t("open")}
              </DropdownMenuItem>
              {status === "overdue" && (
                <DropdownMenuItem onClick={pay}>
                  <HandCoins className="size-4" />
                  {t("recordPayment")}
                </DropdownMenuItem>
              )}
              {status !== "draft" && (
                <DropdownMenuItem onClick={copyLink}>
                  <Link2 className="size-4" />
                  {tInvoices("actions.copyLink")}
                </DropdownMenuItem>
              )}
              {(status === "issued" || status === "overdue" || status === "paid") && (
                <DropdownMenuItem variant="destructive" onClick={() => setConfirming("void")}>
                  <Ban className="size-4" />
                  {tInvoices("actions.void")}
                </DropdownMenuItem>
              )}
              {status === "draft" && (
                <DropdownMenuItem variant="destructive" onClick={() => setConfirming("delete")}>
                  <Trash2 className="size-4" />
                  {tInvoices("actions.delete")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirming(null)}
          title={confirmCopy[confirming].title}
          description={confirmCopy[confirming].body}
          confirmLabel={confirmCopy[confirming].label}
          variant={confirmCopy[confirming].variant}
          onConfirm={onConfirm}
          pending={pending}
        />
      )}
      <RecordPaymentDialog
        open={paying}
        onOpenChange={setPaying}
        coachId={coachId}
        invoices={[invoice]}
        paymentMethods={paymentMethods}
        invoiceId={invoice.id}
      />
    </>
  );
}
