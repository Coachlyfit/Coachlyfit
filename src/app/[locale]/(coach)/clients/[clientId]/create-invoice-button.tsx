"use client";

import { useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { createInvoiceFromTransactionAction } from "@/app/[locale]/(coach)/invoices/actions";

/** Creates a draft prefilled from this payment, then the action redirects
 * to it for review before issuing. */
export function CreateInvoiceButton({ transactionId }: { transactionId: string }) {
  const t = useTranslations("clients.billing.transactions");
  const tErrors = useTranslations("invoices.errors");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      className="text-sm text-primary hover:underline disabled:opacity-60"
      onClick={() =>
        startTransition(async () => {
          const result = await createInvoiceFromTransactionAction(locale, transactionId);
          if (result?.error) toast.error(tErrors(result.error));
        })
      }
    >
      {pending ? tCommon("pending") : t("createInvoice")}
    </button>
  );
}
