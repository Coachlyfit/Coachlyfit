import type { AppLocale } from "@/domain/locale";

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** Same plain-HTML shell as notifications/email-templates.ts, but every
 * interpolated string is escaped: body/subject carry the coach's business
 * name and the invoice total, and a business name is free text the coach
 * typed. Copy comes in already translated (next-intl in the action). */
export function renderInvoiceEmail(opts: { locale: AppLocale; body: string; cta: string; url: string }): string {
  const dir = opts.locale === "ar" ? "rtl" : "ltr";
  return `<!doctype html>
<html dir="${dir}" lang="${opts.locale}">
  <body style="font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;padding:24px;margin:0;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;">
      <p style="font-size:15px;color:#0f172a;margin:0 0 20px;">${escapeHtml(opts.body)}</p>
      <a href="${escapeHtml(opts.url)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;padding:10px 18px;font-size:14px;">${escapeHtml(opts.cta)}</a>
    </div>
  </body>
</html>`;
}
