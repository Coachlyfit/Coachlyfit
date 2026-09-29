import { describe, expect, it } from "vitest";
import { calculateTotals, canTransition, isEditable, INVOICE_STATUSES } from "./invoices";
import { InvoiceError, InvoicesService } from "./invoices.service";

describe("calculateTotals", () => {
  it("sums rounded lines and applies no tax at rate 0", () => {
    const { lines, subtotal, tax, total } = calculateTotals(
      [
        { description: "برنامج تدريب ٣ شهور", quantity: 1, unit_price: 3600 },
        { description: "متابعة أسبوعية", quantity: 12, unit_price: 75 },
      ],
      0
    );
    expect(lines.map((l) => l.line_total)).toEqual([3600, 900]);
    expect({ subtotal, tax, total }).toEqual({ subtotal: 4500, tax: 0, total: 4500 });
  });

  it("applies a percentage tax on the subtotal (Egypt 14%)", () => {
    expect(calculateTotals([{ description: "x", quantity: 1, unit_price: 1000 }], 14)).toMatchObject({
      subtotal: 1000,
      tax: 140,
      total: 1140,
    });
  });

  it("rounds each line half-up to 2 decimals, including float-trap values", () => {
    // 1.005 * 1 is 1.00499999... in binary; must still round to 1.01.
    const { lines, subtotal } = calculateTotals(
      [
        { description: "a", quantity: 1, unit_price: 1.005 },
        { description: "b", quantity: 3, unit_price: 0.1 },
      ],
      0
    );
    expect(lines.map((l) => l.line_total)).toEqual([1.01, 0.3]);
    expect(subtotal).toBe(1.31);
  });

  it("rounds tax to 2 decimals (UAE 5% on an odd subtotal)", () => {
    expect(calculateTotals([{ description: "x", quantity: 1, unit_price: 99.99 }], 5)).toMatchObject({
      tax: 5,
      total: 104.99,
    });
  });

  it("totals an empty invoice to zero", () => {
    expect(calculateTotals([], 14)).toMatchObject({ subtotal: 0, tax: 0, total: 0 });
  });
});

describe("status transitions", () => {
  const allowed = new Set(["draft->issued", "issued->paid", "issued->void", "paid->void"]);

  for (const from of INVOICE_STATUSES) {
    for (const to of INVOICE_STATUSES) {
      const key = `${from}->${to}`;
      it(`${key} is ${allowed.has(key) ? "allowed" : "rejected"}`, () => {
        expect(canTransition(from, to)).toBe(allowed.has(key));
      });
    }
  }

  it("only a draft is editable", () => {
    expect(INVOICE_STATUSES.filter(isEditable)).toEqual(["draft"]);
  });
});

/** Recording thenable chain, same spirit as client-billing.service.test.ts's
 * fakeSupabase(): every builder method returns the chain, awaiting it (or
 * .single()/.maybeSingle()) resolves per operation. `status` seeds what a
 * `select("status")` guard read sees. */
function fakeSupabase(opts: { status?: string | null; transaction?: unknown } = {}) {
  const calls: { table: string; op: string; payload?: unknown; filters: [string, unknown][] }[] = [];
  const rpcs: { fn: string; args: unknown }[] = [];

  const db = {
    from(table: string) {
      const call = { table, op: "select", payload: undefined as unknown, filters: [] as [string, unknown][] };
      calls.push(call);

      const resolve = () => {
        if (call.op === "insert") {
          return { data: Array.isArray(call.payload) ? call.payload : { id: `new-${table}`, ...(call.payload as object) }, error: null };
        }
        if (call.op !== "select") return { data: null, error: null };
        if (table === "client_transactions") return { data: opts.transaction ?? null, error: null };
        return { data: opts.status === null ? null : { status: opts.status ?? "draft" }, error: null };
      };

      const chain: Record<string, unknown> = {
        select: () => chain,
        insert: (payload: unknown) => ((call.op = "insert"), (call.payload = payload), chain),
        update: (payload: unknown) => ((call.op = "update"), (call.payload = payload), chain),
        delete: () => ((call.op = "delete"), chain),
        eq: (col: string, val: unknown) => (call.filters.push([col, val]), chain),
        single: async () => resolve(),
        maybeSingle: async () => resolve(),
        then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(resolve()).then(onFulfilled),
      };
      return chain;
    },
    rpc: async (fn: string, args: unknown) => {
      rpcs.push({ fn, args });
      return { data: { id: "inv-1", status: "issued", invoice_number: "INV-0001" }, error: null };
    },
  };

  return { db: db as never, calls, rpcs };
}

const DRAFT = {
  currency: "EGP" as const,
  tax_rate: 14,
  items: [
    { description: "برنامج غذائي", quantity: 2, unit_price: 250 },
    { description: "Check-in", quantity: 1, unit_price: 100 },
  ],
};

describe("InvoicesService", () => {
  it("createManual stamps coach_id, stores computed totals and ordered lines", async () => {
    const { db, calls } = fakeSupabase();
    await new InvoicesService(db).createManual("coach-1", { ...DRAFT, client_id: "client-9" });

    const invoiceInsert = calls.find((c) => c.table === "invoices" && c.op === "insert");
    expect(invoiceInsert?.payload).toMatchObject({
      coach_id: "coach-1",
      client_id: "client-9",
      subtotal: 600,
      tax: 84,
      total: 684,
    });
    expect(invoiceInsert?.payload).not.toHaveProperty("items");

    const itemsInsert = calls.find((c) => c.table === "invoice_items" && c.op === "insert");
    expect(itemsInsert?.payload).toEqual([
      { description: "برنامج غذائي", quantity: 2, unit_price: 250, line_total: 500, invoice_id: "new-invoices", position: 0 },
      { description: "Check-in", quantity: 1, unit_price: 100, line_total: 100, invoice_id: "new-invoices", position: 1 },
    ]);
  });

  it("createFromTransaction prefills one EGP line from the package, untaxed, linked to the payment", async () => {
    const { db, calls } = fakeSupabase({
      transaction: {
        client_id: "client-9",
        amount_egp: 1500,
        transaction_date: "2026-09-20",
        client_subscriptions: { client_packages: { name_ar: "باقة ٣ شهور", name_en: "3-month package" } },
      },
    });
    await new InvoicesService(db).createFromTransaction("coach-1", "tx-1", "ar");

    expect(calls.find((c) => c.table === "invoices" && c.op === "insert")?.payload).toMatchObject({
      client_id: "client-9",
      transaction_id: "tx-1",
      currency: "EGP",
      tax_rate: 0,
      issue_date: "2026-09-20",
      total: 1500,
    });
    expect(calls.find((c) => c.table === "invoice_items" && c.op === "insert")?.payload).toMatchObject([
      { description: "باقة ٣ شهور", quantity: 1, unit_price: 1500 },
    ]);
  });

  it("createFromTransaction rejects a transaction RLS doesn't show", async () => {
    const { db } = fakeSupabase({ transaction: null });
    await expect(new InvoicesService(db).createFromTransaction("coach-1", "tx-x", "en")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("updateDraft recomputes totals and replaces all lines", async () => {
    const { db, calls } = fakeSupabase({ status: "draft" });
    await new InvoicesService(db).updateDraft("inv-1", DRAFT);

    expect(calls.find((c) => c.table === "invoices" && c.op === "update")?.payload).toMatchObject({ total: 684 });
    expect(calls.find((c) => c.table === "invoice_items" && c.op === "delete")?.filters).toEqual([["invoice_id", "inv-1"]]);
    expect(calls.some((c) => c.table === "invoice_items" && c.op === "insert")).toBe(true);
  });

  for (const status of ["issued", "paid", "void"]) {
    it(`updateDraft and deleteDraft refuse a ${status} invoice without writing`, async () => {
      const { db, calls } = fakeSupabase({ status });
      const service = new InvoicesService(db);
      await expect(service.updateDraft("inv-1", DRAFT)).rejects.toBeInstanceOf(InvoiceError);
      await expect(service.deleteDraft("inv-1")).rejects.toMatchObject({ code: "not_editable" });
      expect(calls.filter((c) => c.op !== "select")).toEqual([]);
    });
  }

  it("issue goes through the issue_invoice RPC, never a direct status write", async () => {
    const { db, calls, rpcs } = fakeSupabase({ status: "draft" });
    const issued = await new InvoicesService(db).issue("inv-1");

    expect(rpcs).toEqual([{ fn: "issue_invoice", args: { p_invoice_id: "inv-1" } }]);
    expect(issued.invoice_number).toBe("INV-0001");
    expect(calls.filter((c) => c.op === "update")).toEqual([]);
  });

  it("issue refuses an already-issued invoice", async () => {
    const { db, rpcs } = fakeSupabase({ status: "issued" });
    await expect(new InvoicesService(db).issue("inv-1")).rejects.toMatchObject({ code: "invalid_transition" });
    expect(rpcs).toEqual([]);
  });

  it("markPaid moves issued -> paid; void moves paid -> void", async () => {
    const issued = fakeSupabase({ status: "issued" });
    await new InvoicesService(issued.db).markPaid("inv-1");
    expect(issued.calls.find((c) => c.op === "update")?.payload).toEqual({ status: "paid" });

    const paid = fakeSupabase({ status: "paid" });
    await new InvoicesService(paid.db).void("inv-1");
    expect(paid.calls.find((c) => c.op === "update")?.payload).toEqual({ status: "void" });
  });

  it("markPaid refuses a draft or a void invoice", async () => {
    for (const status of ["draft", "void"]) {
      const { db } = fakeSupabase({ status });
      await expect(new InvoicesService(db).markPaid("inv-1")).rejects.toMatchObject({ code: "invalid_transition" });
    }
  });

  it("reports not_found for an invoice RLS hides", async () => {
    const { db } = fakeSupabase({ status: null });
    await expect(new InvoicesService(db).void("inv-x")).rejects.toMatchObject({ code: "not_found" });
  });
});
