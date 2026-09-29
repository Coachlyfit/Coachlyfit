import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { pickLocale, type AppLocale } from "@/domain/locale";
import {
  calculateTotals,
  canTransition,
  isEditable,
  type InvoiceCurrency,
  type InvoiceLineInput,
  type InvoiceParties,
  type InvoiceStatus,
} from "./invoices";

type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type InvoiceItem = Database["public"]["Tables"]["invoice_items"]["Row"];

export const COACH_LOGOS_BUCKET = "coach-logos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type InvoiceDraftInput = {
  client_id: string;
  transaction_id?: string | null;
  currency: InvoiceCurrency;
  tax_rate: number;
  issue_date?: string | null;
  due_date?: string | null;
  notes?: string | null;
  items: InvoiceLineInput[];
};

export type InvoiceListFilters = { status?: InvoiceStatus; clientId?: string };

/** Thrown for rule violations the UI should explain (vs. a raw DB error). */
export class InvoiceError extends Error {
  constructor(public code: "not_found" | "not_editable" | "invalid_transition") {
    super(code);
  }
}

/** Coach -> client invoices. The DB enforces immutability and numbering
 * (triggers + issue_invoice() in 20260929000001_invoices.sql); this service
 * owns totals and checks the same rules up front so callers get a typed
 * InvoiceError instead of a raw 42501. */
export class InvoicesService {
  constructor(private db: SupabaseClient<Database>) {}

  async list(coachId: string, filters: InvoiceListFilters = {}) {
    let query = this.db
      .from("invoices")
      .select("*, clients(display_name)")
      .eq("coach_id", coachId)
      .order("created_at", { ascending: false });
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.clientId) query = query.eq("client_id", filters.clientId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  /** RLS already hides drafts from the client -- no status filter needed. */
  async listForClient(clientId: string): Promise<Invoice[]> {
    const { data, error } = await this.db
      .from("invoices")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  /** transaction_id -> invoice_id, for the client billing section's
   * "Create invoice" / "View invoice" link per payment row. */
  async invoiceIdsByTransaction(transactionIds: string[]): Promise<Map<string, string>> {
    if (transactionIds.length === 0) return new Map();
    const { data, error } = await this.db
      .from("invoices")
      .select("id, transaction_id")
      .in("transaction_id", transactionIds)
      .neq("status", "void");
    if (error) throw error;
    return new Map(data.map((row) => [row.transaction_id!, row.id]));
  }

  /** Everything the invoice document needs: the invoice, its ordered items
   * and the header parties -- the frozen snapshot once issued, the live
   * coach/client rows while still a draft. */
  async getDocument(id: string): Promise<{ invoice: Invoice; items: InvoiceItem[]; parties: InvoiceParties } | null> {
    // A malformed id from the URL is a 404, not a Postgres uuid cast error.
    if (!UUID.test(id)) return null;
    const { data, error } = await this.db
      .from("invoices")
      .select("*, invoice_items(*), clients(display_name, email, phone)")
      .eq("id", id)
      .order("position", { referencedTable: "invoice_items" })
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const { invoice_items: items, clients: client, ...invoice } = data;
    if (invoice.snapshot) return { invoice, items, parties: invoice.snapshot as unknown as InvoiceParties };

    const { data: seller, error: sellerError } = await this.db
      .from("coaches")
      .select("business_name, logo_path, address, tax_number, contact_phone, contact_email")
      .eq("id", invoice.coach_id)
      .single();
    if (sellerError) throw sellerError;
    return { invoice, items, parties: { seller, client } };
  }

  logoUrl(path: string | null): string | null {
    return path ? this.db.storage.from(COACH_LOGOS_BUCKET).getPublicUrl(path).data.publicUrl : null;
  }

  async createManual(coachId: string, input: InvoiceDraftInput): Promise<Invoice> {
    const { items, ...fields } = input;
    const { lines, subtotal, tax, total } = calculateTotals(items, input.tax_rate);

    const { data: invoice, error } = await this.db
      .from("invoices")
      .insert({ coach_id: coachId, ...fields, subtotal, tax, total })
      .select()
      .single();
    if (error) throw error;

    const { error: itemsError } = await this.db
      .from("invoice_items")
      .insert(lines.map((line, position) => ({ ...line, invoice_id: invoice.id, position })));
    if (itemsError) {
      // No multi-statement transactions over PostgREST -- undo the empty
      // draft by hand rather than leave an item-less invoice behind.
      await this.db.from("invoices").delete().eq("id", invoice.id);
      throw itemsError;
    }
    return invoice;
  }

  /** Prefills one line from the payment's package. tax_rate 0 on purpose:
   * the recorded amount is what the client actually paid, so adding tax on
   * top would invoice more than was received. The coach can still edit the
   * draft before issuing. */
  async createFromTransaction(coachId: string, transactionId: string, locale: AppLocale): Promise<Invoice> {
    const { data: tx, error } = await this.db
      .from("client_transactions")
      .select("client_id, amount_egp, transaction_date, client_subscriptions(client_packages(name_ar, name_en))")
      .eq("id", transactionId)
      .maybeSingle();
    if (error) throw error;
    if (!tx) throw new InvoiceError("not_found");

    return this.createManual(coachId, {
      client_id: tx.client_id,
      transaction_id: transactionId,
      currency: "EGP",
      tax_rate: 0,
      issue_date: tx.transaction_date,
      items: [
        {
          description: pickLocale(tx.client_subscriptions?.client_packages, locale),
          quantity: 1,
          unit_price: tx.amount_egp,
        },
      ],
    });
  }

  /** Replace-all for items: a draft's lines are small, and diffing them
   * buys nothing a coach can see. */
  async updateDraft(id: string, input: Omit<InvoiceDraftInput, "client_id" | "transaction_id">): Promise<void> {
    await this.requireStatus(id, isEditable, "not_editable");
    const { items, ...fields } = input;
    const { lines, subtotal, tax, total } = calculateTotals(items, input.tax_rate);

    const { error } = await this.db.from("invoices").update({ ...fields, subtotal, tax, total }).eq("id", id);
    if (error) throw error;
    const { error: deleteError } = await this.db.from("invoice_items").delete().eq("invoice_id", id);
    if (deleteError) throw deleteError;
    const { error: insertError } = await this.db
      .from("invoice_items")
      .insert(lines.map((line, position) => ({ ...line, invoice_id: id, position })));
    if (insertError) throw insertError;
  }

  async deleteDraft(id: string): Promise<void> {
    await this.requireStatus(id, isEditable, "not_editable");
    const { error } = await this.db.from("invoices").delete().eq("id", id);
    if (error) throw error;
  }

  async issue(id: string): Promise<Invoice> {
    await this.requireStatus(id, (status) => canTransition(status, "issued"), "invalid_transition");
    const { data, error } = await this.db.rpc("issue_invoice", { p_invoice_id: id });
    if (error) throw error;
    return data;
  }

  markPaid(id: string) {
    return this.transition(id, "paid");
  }

  void(id: string) {
    return this.transition(id, "void");
  }

  private async transition(id: string, to: "paid" | "void"): Promise<void> {
    await this.requireStatus(id, (status) => canTransition(status, to), "invalid_transition");
    const { error } = await this.db.from("invoices").update({ status: to }).eq("id", id);
    if (error) throw error;
  }

  private async requireStatus(
    id: string,
    allowed: (status: InvoiceStatus) => boolean,
    code: "not_editable" | "invalid_transition"
  ): Promise<void> {
    const { data, error } = await this.db.from("invoices").select("status").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new InvoiceError("not_found");
    // status is a CHECK-constrained text column, not a DB enum -- codegen
    // can't narrow it past string.
    if (!allowed(data.status as InvoiceStatus)) throw new InvoiceError(code);
  }
}
