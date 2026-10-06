// Invoices are legal documents: once issued, nothing but the status may
// change, and never backwards. This proves the DB (RLS + the guard triggers
// + issue_invoice() in 20260929000001_invoices.sql) enforces that on its
// own -- the service/UI checks are just a nicer error on top. Also proves
// the usual tenant isolation and that per-coach numbering is race-safe.
import { beforeAll, describe, expect, it } from "vitest";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";

async function createCoach(tag: string) {
  return createRlsUser(`inv-coach-${tag}`, {
    role: "coach",
    full_name: `Coach ${tag}`,
    business_name: `${tag} Fitness`,
    locale: "ar",
  });
}

async function createClientOf(coachId: string, tag: string, displayName: string) {
  const { userId, client } = await createRlsUser(`inv-client-${tag}`, {
    role: "client",
    full_name: displayName,
    locale: "ar",
  });
  const { data: row, error } = await admin
    .from("clients")
    .insert({ coach_id: coachId, profile_id: userId, display_name: displayName })
    .select("id")
    .single();
  if (error) throw error;
  return { userId, clientRowId: row.id as string, client };
}

type Coach = Awaited<ReturnType<typeof createCoach>>;
type ClientOf = Awaited<ReturnType<typeof createClientOf>>;

let coachA: Coach;
let coachB: Coach;
let clientOfA: ClientOf;
let clientOfB: ClientOf;

async function createDraft(coach: Coach, clientRowId: string) {
  const { data: invoice, error } = await coach.client
    .from("invoices")
    .insert({ coach_id: coach.userId, client_id: clientRowId, subtotal: 500, tax: 0, total: 500 })
    .select("id")
    .single();
  if (error) throw error;
  const { error: itemError } = await coach.client
    .from("invoice_items")
    .insert({ invoice_id: invoice.id, description: "برنامج تدريب شهري", quantity: 1, unit_price: 500, line_total: 500 });
  if (itemError) throw itemError;
  return invoice.id as string;
}

let invoiceId: string;

beforeAll(async () => {
  [coachA, coachB] = await Promise.all([createCoach("a"), createCoach("b")]);
  [clientOfA, clientOfB] = await Promise.all([
    createClientOf(coachA.userId, "a1", "سارة عبد الرحمن"),
    createClientOf(coachB.userId, "b1", "Client B"),
  ]);
  invoiceId = await createDraft(coachA, clientOfA.clientRowId);
}, 60_000);

describe("invoices: drafts", () => {
  it("a new invoice cannot be inserted already issued", async () => {
    const { error } = await coachA.client.from("invoices").insert({
      coach_id: coachA.userId,
      client_id: clientOfA.clientRowId,
      status: "issued",
      invoice_number: "INV-9999",
    });
    expect(error).not.toBeNull();
  });

  it("a draft cannot be flipped to issued by a direct update", async () => {
    const { error } = await coachA.client.from("invoices").update({ status: "issued" }).eq("id", invoiceId);
    expect(error).not.toBeNull();
  });

  it("the client cannot see a draft or its items", async () => {
    const { data } = await clientOfA.client.from("invoices").select("id").eq("id", invoiceId);
    expect(data).toEqual([]);
    const { data: items } = await clientOfA.client.from("invoice_items").select("id").eq("invoice_id", invoiceId);
    expect(items).toEqual([]);
  });

  it("a coach cannot address an invoice to another coach's client", async () => {
    const { error } = await coachA.client
      .from("invoices")
      .insert({ coach_id: coachA.userId, client_id: clientOfB.clientRowId });
    expect(error).not.toBeNull();
  });
});

describe("invoices: issuing and immutability", () => {
  it("issue_invoice assigns INV-0001, stamps issue_date and freezes the parties", async () => {
    const { data, error } = await coachA.client.rpc("issue_invoice", { p_invoice_id: invoiceId });
    if (error) throw error;
    expect(data.status).toBe("issued");
    expect(data.invoice_number).toBe("INV-0001");
    expect(data.issue_date).not.toBeNull();
    expect(data.snapshot).toMatchObject({
      seller: { business_name: "a Fitness" },
      client: { display_name: "سارة عبد الرحمن" },
    });
  });

  it("a foreign coach cannot read or issue it", async () => {
    const { data } = await coachB.client.from("invoices").select("id").eq("id", invoiceId);
    expect(data).toEqual([]);
    const { error } = await coachB.client.rpc("issue_invoice", { p_invoice_id: invoiceId });
    expect(error).not.toBeNull();
  });

  it("the client now reads their issued invoice and its Arabic line items", async () => {
    const { data, error } = await clientOfA.client
      .from("invoices")
      .select("invoice_number, invoice_items(description)")
      .eq("id", invoiceId)
      .single();
    if (error) throw error;
    expect(data.invoice_number).toBe("INV-0001");
    expect(data.invoice_items).toEqual([{ description: "برنامج تدريب شهري" }]);
  });

  it("another coach's client cannot read it", async () => {
    const { data } = await clientOfB.client.from("invoices").select("id").eq("id", invoiceId);
    expect(data).toEqual([]);
  });

  it("the client cannot change it", async () => {
    const { data } = await clientOfA.client.from("invoices").update({ status: "paid" }).eq("id", invoiceId).select("id");
    expect(data).toEqual([]);
  });

  it("an issued invoice's fields and items cannot be edited, and it cannot be deleted", async () => {
    const edit = await coachA.client.from("invoices").update({ total: 1 }).eq("id", invoiceId);
    expect(edit.error).not.toBeNull();

    const addItem = await coachA.client
      .from("invoice_items")
      .insert({ invoice_id: invoiceId, description: "extra", quantity: 1, unit_price: 1, line_total: 1 });
    expect(addItem.error).not.toBeNull();

    const editItem = await coachA.client.from("invoice_items").update({ unit_price: 1 }).eq("invoice_id", invoiceId);
    expect(editItem.error).not.toBeNull();

    const del = await coachA.client.from("invoices").delete().eq("id", invoiceId);
    expect(del.error).not.toBeNull();

    const issueAgain = await coachA.client.rpc("issue_invoice", { p_invoice_id: invoiceId });
    expect(issueAgain.error).not.toBeNull();

    const { data } = await admin.from("invoices").select("total, status").eq("id", invoiceId).single();
    expect(data).toEqual({ total: 500, status: "issued" });
  });

  it("status only moves forward: issued -> paid -> void, never back", async () => {
    const paid = await coachA.client.from("invoices").update({ status: "paid" }).eq("id", invoiceId);
    expect(paid.error).toBeNull();

    const back = await coachA.client.from("invoices").update({ status: "issued" }).eq("id", invoiceId);
    expect(back.error).not.toBeNull();

    const voided = await coachA.client.from("invoices").update({ status: "void" }).eq("id", invoiceId);
    expect(voided.error).toBeNull();

    const revive = await coachA.client.from("invoices").update({ status: "paid" }).eq("id", invoiceId);
    expect(revive.error).not.toBeNull();
  });

  it("a draft can still be deleted", async () => {
    const draftId = await createDraft(coachA, clientOfA.clientRowId);
    const { error } = await coachA.client.from("invoices").delete().eq("id", draftId);
    expect(error).toBeNull();
    const { data } = await admin.from("invoices").select("id").eq("id", draftId);
    expect(data).toEqual([]);
  });
});

describe("invoices: numbering", () => {
  it("concurrent issues get distinct consecutive numbers, and numbering is per coach", async () => {
    const drafts = await Promise.all([1, 2, 3].map(() => createDraft(coachA, clientOfA.clientRowId)));
    const results = await Promise.all(drafts.map((id) => coachA.client.rpc("issue_invoice", { p_invoice_id: id })));
    const numbers = results.map((r) => {
      if (r.error) throw r.error;
      return r.data.invoice_number;
    });
    expect(numbers.sort()).toEqual(["INV-0002", "INV-0003", "INV-0004"]);

    const bDraft = await createDraft(coachB, clientOfB.clientRowId);
    const { data, error } = await coachB.client.rpc("issue_invoice", { p_invoice_id: bDraft });
    if (error) throw error;
    expect(data.invoice_number).toBe("INV-0001");
  });

  it("an item-less draft cannot be issued", async () => {
    const { data: invoice, error } = await coachA.client
      .from("invoices")
      .insert({ coach_id: coachA.userId, client_id: clientOfA.clientRowId })
      .select("id")
      .single();
    if (error) throw error;
    const issue = await coachA.client.rpc("issue_invoice", { p_invoice_id: invoice.id });
    expect(issue.error).not.toBeNull();
  });
});

describe("invoices: recording a payment", () => {
  let issuedId: string;
  let methodId: string;

  beforeAll(async () => {
    const draftId = await createDraft(coachA, clientOfA.clientRowId);
    const issued = await coachA.client.rpc("issue_invoice", { p_invoice_id: draftId });
    if (issued.error) throw issued.error;
    issuedId = draftId;

    const { data: method, error } = await coachA.client
      .from("client_payment_methods")
      .insert({ coach_id: coachA.userId, name_ar: "إنستاباي", name_en: "InstaPay" })
      .select("id")
      .single();
    if (error) throw error;
    methodId = method.id;
  }, 60_000);

  it("paid_at cannot be forged by a direct update", async () => {
    const { error } = await coachA.client.from("invoices").update({ paid_at: "2020-01-01" }).eq("id", issuedId);
    expect(error).not.toBeNull();
  });

  it("a foreign coach cannot record a payment on it", async () => {
    const { error } = await coachB.client.rpc("record_invoice_payment", {
      p_invoice_id: issuedId,
      p_payment_method_id: methodId,
    });
    expect(error).not.toBeNull();
    const { data } = await admin.from("invoices").select("status, transaction_id").eq("id", issuedId).single();
    expect(data).toEqual({ status: "issued", transaction_id: null });
  });

  it("another coach's payment method and a foreign proof path are rejected", async () => {
    const { data: foreign, error } = await coachB.client
      .from("client_payment_methods")
      .insert({ coach_id: coachB.userId, name_ar: "كاش", name_en: "Cash" })
      .select("id")
      .single();
    if (error) throw error;

    const wrongMethod = await coachA.client.rpc("record_invoice_payment", {
      p_invoice_id: issuedId,
      p_payment_method_id: foreign.id,
    });
    expect(wrongMethod.error).not.toBeNull();

    const wrongProof = await coachA.client.rpc("record_invoice_payment", {
      p_invoice_id: issuedId,
      p_payment_method_id: methodId,
      p_proof_path: `${coachB.userId}/${clientOfB.clientRowId}/proof.png`,
    });
    expect(wrongProof.error).not.toBeNull();
  });

  it("marks it paid, stamps paid_at and records the payment for the full amount, once", async () => {
    const { data, error } = await coachA.client.rpc("record_invoice_payment", {
      p_invoice_id: issuedId,
      p_payment_method_id: methodId,
      p_paid_on: "2026-10-02",
    });
    if (error) throw error;
    expect(data.status).toBe("paid");
    expect(data.paid_at).toContain("2026-10-02");

    const { data: tx } = await admin
      .from("client_transactions")
      .select("amount_egp, currency, transaction_date, client_id, subscription_id")
      .eq("id", data.transaction_id!)
      .single();
    expect(tx).toEqual({
      amount_egp: 500,
      currency: "EGP",
      transaction_date: "2026-10-02",
      client_id: clientOfA.clientRowId,
      subscription_id: null,
    });

    const again = await coachA.client.rpc("record_invoice_payment", {
      p_invoice_id: issuedId,
      p_payment_method_id: methodId,
    });
    expect(again.error).not.toBeNull();
  });
});
