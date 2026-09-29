import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { ClientBillingService } from "@/domain/billing/client-billing.service";
import { InvoicesService } from "@/domain/billing/invoices.service";
import { Link } from "@/i18n/navigation";
import type { ClientSubscriptionStatus } from "@/domain/billing/client-subscription";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatDate, formatNumber } from "@/lib/format";
import { SubscriptionCard } from "./subscription-card";
import { RecordTransactionDialog } from "./record-transaction-dialog";
import { CreateInvoiceButton } from "./create-invoice-button";

export async function BillingSection({ clientId, locale }: { clientId: string; locale: AppLocale }) {
  const t = await getTranslations("clients.billing");
  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  if (!coachId) notFound();

  const billing = new ClientBillingService(supabase);
  const [subscription, transactions, packages, paymentMethods] = await Promise.all([
    billing.getActiveSubscription(clientId),
    billing.listTransactions(clientId),
    billing.listPackages(coachId),
    billing.listPaymentMethods(coachId),
  ]);

  const proofPaths = transactions.map((tx) => tx.proof_path).filter((p): p is string => !!p);
  const [signedProofUrls, invoiceByTransaction] = await Promise.all([
    billing.signProofUrls(proofPaths),
    new InvoicesService(supabase).invoiceIdsByTransaction(transactions.map((tx) => tx.id)),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <SubscriptionCard
        locale={locale}
        clientId={clientId}
        // `status` is a checked text column, not a DB enum — Supabase
        // codegen can't narrow it past `string`. Trusting the CHECK
        // constraint here, same idiom as program-builder.tsx's
        // `progression_rule as ProgressionRule`.
        subscription={subscription ? { ...subscription, status: subscription.status as ClientSubscriptionStatus } : null}
        packages={packages}
      />

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t("transactions.title")}</h2>
        {subscription && (
          <RecordTransactionDialog
            locale={locale}
            coachId={coachId}
            clientId={clientId}
            subscriptionId={subscription.id}
            paymentMethods={paymentMethods}
          />
        )}
      </div>

      {transactions.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            {t("transactions.empty")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("transactions.date")}</TableHead>
                <TableHead>{t("transactions.method")}</TableHead>
                <TableHead>{t("transactions.amount")}</TableHead>
                <TableHead />
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatDate(tx.transaction_date, locale)}
                  </TableCell>
                  <TableCell>{pickLocale(tx.client_payment_methods, locale)}</TableCell>
                  <TableCell className="tabular-nums font-medium">
                    {formatNumber(tx.amount_egp, locale)} {t("transactions.egp")}
                  </TableCell>
                  <TableCell>
                    {tx.proof_path && signedProofUrls.has(tx.proof_path) ? (
                      <a
                        href={signedProofUrls.get(tx.proof_path)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        {t("transactions.viewProof")}
                      </a>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-end">
                    {invoiceByTransaction.has(tx.id) ? (
                      <Link
                        href={`/invoices/${invoiceByTransaction.get(tx.id)}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {t("transactions.viewInvoice")}
                      </Link>
                    ) : (
                      <CreateInvoiceButton transactionId={tx.id} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
