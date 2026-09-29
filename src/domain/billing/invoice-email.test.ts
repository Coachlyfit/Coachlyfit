import { describe, expect, it } from "vitest";
import { renderInvoiceEmail } from "./invoice-email";

describe("renderInvoiceEmail", () => {
  it("escapes coach-controlled text so a business name can't inject markup", () => {
    const html = renderInvoiceEmail({
      locale: "en",
      body: `<img src=x onerror="alert(1)"> Fitness sent you invoice INV-0001`,
      cta: "View invoice",
      url: "https://app.example/en/c/invoices/1",
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("renders Arabic right-to-left", () => {
    const html = renderInvoiceEmail({ locale: "ar", body: "فاتورة", cta: "عرض الفاتورة", url: "https://x" });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("عرض الفاتورة");
  });
});
