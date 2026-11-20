// Plain HTML for the two application emails. Pure (strings in, html out) so it
// is testable; the caller supplies translated text.

export const escapeHtml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const shell = (dir: "rtl" | "ltr", inner: string) =>
  `<div dir="${dir}" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#0f172a">${inner}</div>`;

const link = (url: string) => `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`;

export function coachNotificationHtml(args: {
  dir: "rtl" | "ltr";
  intro: string;
  rows: Array<[label: string, value: string]>;
  openLabel: string;
  openUrl: string;
}) {
  const rows = args.rows
    .filter(([, v]) => v.trim() !== "")
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;font-weight:600;vertical-align:top">${escapeHtml(k)}</td><td style="padding:4px 0;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`)
    .join("");
  return shell(
    args.dir,
    `<p>${escapeHtml(args.intro)}</p><table style="border-collapse:collapse">${rows}</table><p>${escapeHtml(args.openLabel)}<br>${link(args.openUrl)}</p>`,
  );
}

export function welcomeHtml(args: { dir: "rtl" | "ltr"; greeting: string; body: string; joinLabel: string; joinUrl: string; note?: string }) {
  return shell(
    args.dir,
    `<p>${escapeHtml(args.greeting)}</p><p>${escapeHtml(args.body)}</p>${args.note ? `<p style="white-space:pre-wrap">${escapeHtml(args.note)}</p>` : ""}<p>${escapeHtml(args.joinLabel)}<br>${link(args.joinUrl)}</p>`,
  );
}
