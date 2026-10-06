"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Printer, Send, Link2, CheckCircle2, Ban, Trash2, Stamp } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { canTransition, type InvoiceStatus } from "@/domain/billing/invoices";
import {
  RecordPaymentDialog,
  type PayableInvoice,
  type PaymentMethodOption,
} from "@/components/finance/record-payment-dialog";
import {
  deleteDraftAction,
  issueInvoiceAction,
  markPaidAction,
  sendInvoiceEmailAction,
  voidInvoiceAction,
} from "@/app/[locale]/(coach)/invoices/actions";

type Confirming = "issue" | "void" | "delete" | null;

/** Only the actions the current status can actually take are rendered --
 * same transition table the DB trigger enforces (canTransition). */
export function InvoiceActions({
  invoiceId,
  status,
  payment,
}: {
  invoiceId: string;
  status: InvoiceStatus;
  /** Present when paying this invoice should record a payment (method, date,
   * proof). Absent for one created from a recorded payment: that one is just
   * marked paid. */
  payment?: { coachId: string; invoice: PayableInvoice; paymentMethods: PaymentMethodOption[] };
}) {
  const [paying, setPaying] = useState(false);
  const t = useTranslations("invoices.actions");
  const tConfirm = useTranslations("invoices.confirm");
  const tErrors = useTranslations("invoices.errors");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<Confirming>(null);

  function run(action: () => Promise<{ error: string } | object | void>, onSuccess?: (result: object | void) => void) {
    startTransition(async () => {
      const result = await action();
      setConfirming(null);
      if (result && "error" in result) {
        toast.error(tErrors(result.error));
        return;
      }
      onSuccess?.(result);
    });
  }

  function copyLink() {
    navigator.clipboard
      .writeText(`${window.location.origin}/${locale}/c/invoices/${invoiceId}`)
      .then(() => toast.success(t("linkCopied")));
  }

  const confirmCopy = {
    issue: { title: tConfirm("issueTitle"), body: tConfirm("issueBody"), label: t("issue"), variant: "default" as const },
    void: { title: tConfirm("voidTitle"), body: tConfirm("voidBody"), label: t("void"), variant: "destructive" as const },
    delete: { title: tConfirm("deleteTitle"), body: tConfirm("deleteBody"), label: t("delete"), variant: "destructive" as const },
  };

  function onConfirm() {
    if (confirming === "issue") {
      run(
        () => issueInvoiceAction(locale, invoiceId),
        (result) => toast.success(t("issued", { number: (result as { invoiceNumber: string }).invoiceNumber }))
      );
    } else if (confirming === "void") {
      run(() => voidInvoiceAction(locale, invoiceId));
    } else if (confirming === "delete") {
      run(() => deleteDraftAction(locale, invoiceId));
    }
  }

  const sendable = status === "issued" || status === "paid";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canTransition(status, "issued") && (
        <Button type="button" onClick={() => setConfirming("issue")} disabled={pending}>
          <Stamp className="size-4" />
          {t("issue")}
        </Button>
      )}
      {canTransition(status, "paid") && (
        <Button
          type="button"
          onClick={() => (payment ? setPaying(true) : run(() => markPaidAction(locale, invoiceId)))}
          disabled={pending}
        >
          <CheckCircle2 className="size-4" />
          {t("markPaid")}
        </Button>
      )}
      {sendable && (
        <>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => sendInvoiceEmailAction(locale, invoiceId),
                (result) => toast.success(t("sent", { email: (result as { email: string }).email }))
              )
            }
          >
            <Send className="size-4" />
            {t("send")}
          </Button>
          <Button type="button" variant="outline" onClick={copyLink}>
            <Link2 className="size-4" />
            {t("copyLink")}
          </Button>
        </>
      )}
      <a
        href={`/${locale}/print/invoice/${invoiceId}`}
        target="_blank"
        rel="noreferrer"
        className={buttonVariants({ variant: "outline" })}
      >
        <Printer className="size-4" />
        {t("print")}
      </a>
      {canTransition(status, "void") && (
        <Button type="button" variant="ghost" onClick={() => setConfirming("void")} disabled={pending}>
          <Ban className="size-4" />
          {t("void")}
        </Button>
      )}
      {status === "draft" && (
        <Button type="button" variant="ghost" onClick={() => setConfirming("delete")} disabled={pending}>
          <Trash2 className="size-4" />
          {t("delete")}
        </Button>
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
      {payment && (
        <RecordPaymentDialog
          open={paying}
          onOpenChange={setPaying}
          coachId={payment.coachId}
          invoices={[payment.invoice]}
          paymentMethods={payment.paymentMethods}
          invoiceId={invoiceId}
        />
      )}
    </div>
  );
}
