import { describe, expect, it } from "vitest";
import { homeWindow, invoicePaymentStatus, quietClients } from "./coach-home";

const NOW = new Date("2026-10-05T09:00:00Z");

describe("homeWindow", () => {
  it("spans today through six days ahead, and a week back for payments", () => {
    expect(homeWindow(NOW)).toEqual({ today: "2026-10-05", weekEnd: "2026-10-11", paymentsFrom: "2026-09-28" });
  });

  it("crosses a month boundary", () => {
    expect(homeWindow(new Date("2026-10-29T23:30:00Z")).weekEnd).toBe("2026-11-04");
  });
});

describe("invoicePaymentStatus", () => {
  it("is overdue only once the due date has passed", () => {
    expect(invoicePaymentStatus({ status: "issued", due_date: "2026-10-04" }, "2026-10-05")).toBe("overdue");
    expect(invoicePaymentStatus({ status: "issued", due_date: "2026-10-05" }, "2026-10-05")).toBe("due");
  });

  it("never calls a paid invoice overdue", () => {
    expect(invoicePaymentStatus({ status: "paid", due_date: "2026-10-01" }, "2026-10-05")).toBe("paid");
  });

  it("treats an issued invoice with no due date as due", () => {
    expect(invoicePaymentStatus({ status: "issued", due_date: null }, "2026-10-05")).toBe("due");
  });
});

describe("quietClients", () => {
  const clients = [
    { id: "recent", display_name: "Recent", status: "active" },
    { id: "quiet", display_name: "Quiet", status: "active" },
    { id: "quieter", display_name: "Quieter", status: "active" },
    { id: "never", display_name: "Never", status: "active" },
    { id: "invited", display_name: "Invited", status: "invited" },
  ];
  const checkins = [
    { client_id: "recent", checkin_date: "2026-10-03" },
    { client_id: "quiet", checkin_date: "2026-09-20" },
    { client_id: "quiet", checkin_date: "2026-09-26" },
    { client_id: "quieter", checkin_date: "2026-09-20" },
  ];

  it("lists active clients past the 7-day cutoff, longest silence first", () => {
    expect(quietClients(clients, checkins, NOW)).toEqual([
      { id: "quieter", name: "Quieter", days: 15 },
      { id: "quiet", name: "Quiet", days: 9 },
      { id: "never", name: "Never", days: null },
    ]);
  });

  it("does not flag a check-in exactly 7 days old", () => {
    const rows = [{ client_id: "quiet", checkin_date: "2026-09-28" }];
    expect(quietClients([clients[1]], rows, NOW)).toEqual([]);
  });
});
