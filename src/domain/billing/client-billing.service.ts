import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type ClientPackage = Database["public"]["Tables"]["client_packages"]["Row"];
type ClientPaymentMethod = Database["public"]["Tables"]["client_payment_methods"]["Row"];
type ClientSubscription = Database["public"]["Tables"]["client_subscriptions"]["Row"];
type ClientTransaction = Database["public"]["Tables"]["client_transactions"]["Row"];

export const PAYMENT_PROOFS_BUCKET = "payment-proofs";

export type CreatePackageInput = {
  name_ar: string;
  name_en: string;
  duration_days: number;
  price_egp: number;
  description_ar?: string | null;
  description_en?: string | null;
};

export type CreatePaymentMethodInput = { name_ar: string; name_en: string };

export type CreateSubscriptionInput = {
  client_id: string;
  package_id: string;
  start_date?: string;
  end_date: string;
};

export type RecordTransactionInput = {
  client_id: string;
  subscription_id: string;
  payment_method_id: string;
  amount_egp: number;
  transaction_date?: string;
  proof_path?: string | null;
  recorded_by: string;
};

/** Coach -> client billing: packages/payment methods are coach-wide
 * catalogs (createPackage/createPaymentMethod take coachId directly, no
 * parent-row derivation needed — unlike DietPlansService's addMeal/addItem,
 * there's no nested ownership chain here, the caller already knows both
 * coach_id and client_id from the client detail page it's called from). */
export class ClientBillingService {
  constructor(private db: SupabaseClient<Database>) {}

  async listPackages(coachId: string): Promise<ClientPackage[]> {
    const { data, error } = await this.db
      .from("client_packages")
      .select("*")
      .eq("coach_id", coachId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  async createPackage(coachId: string, input: CreatePackageInput): Promise<ClientPackage> {
    const { data, error } = await this.db
      .from("client_packages")
      .insert({ coach_id: coachId, ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updatePackage(id: string, input: CreatePackageInput): Promise<ClientPackage> {
    const { data, error } = await this.db
      .from("client_packages")
      .update(input)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deletePackage(id: string): Promise<boolean> {
    const { data, error } = await this.db.from("client_packages").delete().eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async listPaymentMethods(coachId: string): Promise<ClientPaymentMethod[]> {
    const { data, error } = await this.db
      .from("client_payment_methods")
      .select("*")
      .eq("coach_id", coachId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  async createPaymentMethod(coachId: string, input: CreatePaymentMethodInput): Promise<ClientPaymentMethod> {
    const { data, error } = await this.db
      .from("client_payment_methods")
      .insert({ coach_id: coachId, ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deletePaymentMethod(id: string): Promise<boolean> {
    const { data, error } = await this.db.from("client_payment_methods").delete().eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** Most recent subscription for a client, if any — same "most recent
   * wins, no separate active flag" reasoning as ProgramsService's
   * getActiveTreeForClient. Joins the package so callers get name/price
   * without a second round trip. */
  async getActiveSubscription(
    clientId: string
  ): Promise<(ClientSubscription & { client_packages: ClientPackage }) | null> {
    const { data, error } = await this.db
      .from("client_subscriptions")
      .select("*, client_packages(*)")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async createSubscription(coachId: string, input: CreateSubscriptionInput): Promise<ClientSubscription> {
    const { data, error } = await this.db
      .from("client_subscriptions")
      .insert({ coach_id: coachId, status: "active", ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async freezeSubscription(id: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("client_subscriptions")
      .update({ status: "frozen", frozen_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async unfreezeSubscription(id: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("client_subscriptions")
      .update({ status: "active", frozen_at: null })
      .eq("id", id)
      .select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async cancelSubscription(id: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("client_subscriptions")
      .update({ status: "canceled" })
      .eq("id", id)
      .select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async recordTransaction(coachId: string, input: RecordTransactionInput): Promise<ClientTransaction> {
    const { data, error } = await this.db
      .from("client_transactions")
      .insert({ coach_id: coachId, ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Newest first — same as ProgressService's photo timeline, a transaction
   * history reads most-recent-first. Joins payment method for display. */
  async listTransactions(
    clientId: string
  ): Promise<(ClientTransaction & { client_payment_methods: ClientPaymentMethod })[]> {
    const { data, error } = await this.db
      .from("client_transactions")
      .select("*, client_payment_methods(*)")
      .eq("client_id", clientId)
      .order("transaction_date", { ascending: false });
    if (error) throw error;
    return data;
  }

  /** Batch signed URLs for proof-of-payment files — same pattern as
   * ProgressService.signMediaUrls. */
  async signProofUrls(paths: string[], expiresInSeconds = 3600): Promise<Map<string, string>> {
    if (paths.length === 0) return new Map();
    const { data, error } = await this.db.storage.from(PAYMENT_PROOFS_BUCKET).createSignedUrls(paths, expiresInSeconds);
    if (error) throw error;

    const signed = new Map<string, string>();
    for (const entry of data) {
      if (!entry.error && entry.signedUrl) signed.set(entry.path ?? "", entry.signedUrl);
    }
    signed.delete("");
    return signed;
  }
}
