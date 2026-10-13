/** The one template for admin campaign emails. The compose preview and the
 * send action both call renderCampaignEmail(), so what the admin sees is the
 * HTML that goes out. Plain template strings like
 * notifications/email-templates.ts, and no server-only imports, because the
 * preview runs it in the browser. */

export type EmailDirection = "rtl" | "ltr";

const BRAND_COLOR = "#c2410c";
const FONT_STACK = "'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif";
const VARIABLE = /\{\{\s*coach_name\s*\}\}/g;
const SAFE_URL = /^(https?:\/\/|mailto:)/i;
const HEADING = /^(#{1,2})\s+(.+)$/;

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

const FOOTER: Record<EmailDirection, string> = {
  rtl: "رسالة من فريق Coachly Fit.",
  ltr: "Sent by the Coachly Fit team.",
};

/** Footer of an outreach email to a lead: why they got it and how to stop. */
const OUTREACH_FOOTER: Record<EmailDirection, { text: string; link: string }> = {
  rtl: { text: "تصلك هذه الرسالة لأنني أعرفك أو أعجبني عملك كمدرب. إذا لا ترغب في رسائل أخرى،", link: "إلغاء الاشتراك" },
  ltr: { text: "You're receiving this because I know you or admire your work as a coach. Don't want more emails?", link: "Unsubscribe" },
};

/** Stands in for {{coach_name}} when a lead has no name on file. */
export const NEUTRAL_NAME: Record<EmailDirection, string> = { rtl: "كوتش", ltr: "Coach" };

/** Inline markdown on text that is ALREADY escaped: links, bold, italic.
 * A link whose URL is not http(s) or mailto keeps its text and loses the URL. */
function inline(escaped: string): string {
  return escaped
    .replace(/\[([^\]]+)\]\(([^)\s*]+)\)/g, (_match, text: string, url: string) =>
      SAFE_URL.test(url) ? `<a href="${url}" style="color:${BRAND_COLOR};text-decoration:underline;">${text}</a>` : text
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

/** Small markdown subset: # and ## headings, - lists, paragraphs split by a
 * blank line, single line breaks, **bold**, *italic*, [text](url). The source
 * is escaped before any tag is added, so HTML typed into the body comes out as
 * visible text. */
export function renderMarkdown(source: string): string {
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push(`<p style="margin:0 0 16px;font-size:15px;line-height:1.7;">${paragraph.join("<br>")}</p>`);
      paragraph = [];
    }
    if (list.length > 0) {
      const items = list.map((item) => `<li style="margin:0 0 6px;">${item}</li>`).join("");
      blocks.push(`<ul style="margin:0 0 16px;padding:0;padding-inline-start:20px;font-size:15px;line-height:1.7;">${items}</ul>`);
      list = [];
    }
  };

  for (const rawLine of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = escapeHtml(rawLine.trim());
    const heading = line.match(HEADING);
    if (line === "") {
      flush();
    } else if (heading) {
      flush();
      const size = heading[1].length === 1 ? 22 : 18;
      blocks.push(`<h2 style="margin:0 0 12px;font-size:${size}px;line-height:1.4;font-weight:600;">${inline(heading[2])}</h2>`);
    } else if (line.startsWith("- ")) {
      if (paragraph.length > 0) flush();
      list.push(inline(line.slice(2)));
    } else {
      if (list.length > 0) flush();
      paragraph.push(inline(line));
    }
  }
  flush();

  return blocks.join("\n");
}

/** Replaces {{coach_name}}. Used as-is for the subject (plain text); the body
 * goes through renderMarkdown first and gets the escaped name. */
export function fillVariables(text: string, coachName: string): string {
  return text.replace(VARIABLE, () => coachName);
}

export function renderCampaignEmail(opts: {
  subject: string;
  body: string;
  direction: EmailDirection;
  coachName: string;
  /** Origin for the logo URL. Empty in the in-app preview, where a relative
   * URL resolves against the page. */
  appUrl: string;
  /** Set for outreach to a lead: the footer becomes the outreach one, with
   * this link. Left out for coach emails. */
  unsubscribeUrl?: string;
}): { subject: string; html: string } {
  const lang = opts.direction === "rtl" ? "ar" : "en";
  const subject = fillVariables(opts.subject, opts.coachName);
  const body = fillVariables(renderMarkdown(opts.body), escapeHtml(opts.coachName));
  const logoUrl = `${opts.appUrl.replace(/\/$/, "")}/brand/app-icon-192.png`;
  const outreach = OUTREACH_FOOTER[opts.direction];
  const footer = opts.unsubscribeUrl
    ? `${outreach.text} <a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#64748b;text-decoration:underline;">${outreach.link}</a>.`
    : FOOTER[opts.direction];

  const html = `<!doctype html>
<html dir="${opts.direction}" lang="${lang}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(subject)}</title>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600&display=swap" rel="stylesheet">
  </head>
  <body dir="${opts.direction}" style="margin:0;padding:0;background:#f8fafc;font-family:${FONT_STACK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${opts.direction}" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;border-bottom:3px solid ${BRAND_COLOR};">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;"><img src="${escapeHtml(logoUrl)}" width="36" height="36" alt="" style="display:block;border:0;border-radius:8px;"></td>
                    <td style="vertical-align:middle;padding:0 10px;font-family:${FONT_STACK};font-size:18px;font-weight:600;color:#0f172a;">Coachly Fit</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;font-family:${FONT_STACK};color:#0f172a;text-align:start;">
${body}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f8fafc;font-family:${FONT_STACK};font-size:12px;color:#64748b;text-align:start;">${footer}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html };
}
