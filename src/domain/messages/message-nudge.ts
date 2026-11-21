import { escapeHtml } from "@/domain/coaching-applications/emails";

/** Delays a coach can pick, in minutes. null (stored on the profile) = off. */
export const NUDGE_DELAYS = [30, 60, 120] as const;
export const DEFAULT_NUDGE_MINUTES = 60;

export type NudgeRow = { client_id: string; coach_id: string; first_unread_at: string; email_sent: boolean };

/** Windows whose delay has run out and that haven't been emailed. A coach
 * absent from `delayByCoach`, or mapped to null, has nudges off. */
export function dueNudges<R extends NudgeRow>(rows: R[], delayByCoach: Map<string, number | null>, now: Date): R[] {
  return rows.filter((row) => {
    if (row.email_sent) return false;
    const delay = delayByCoach.get(row.coach_id);
    if (delay == null) return false;
    return new Date(row.first_unread_at).getTime() <= now.getTime() - delay * 60_000;
  });
}

/** The email body. Deliberately has no message content: the client's name and
 * when the first unread message arrived, plus a button to the conversation.
 * Text comes in translated; every value is escaped. */
export function nudgeEmailHtml(args: {
  dir: "rtl" | "ltr";
  intro: string;
  clientLabel: string;
  clientName: string;
  sinceLabel: string;
  since: string;
  buttonLabel: string;
  url: string;
  footer: string;
}): string {
  const e = escapeHtml;
  return `<div dir="${args.dir}" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#0f172a">
<p>${e(args.intro)}</p>
<table style="border-collapse:collapse"><tr><td style="padding:4px 12px 4px 0;font-weight:600">${e(args.clientLabel)}</td><td style="padding:4px 0">${e(args.clientName)}</td></tr><tr><td style="padding:4px 12px 4px 0;font-weight:600">${e(args.sinceLabel)}</td><td style="padding:4px 0">${e(args.since)}</td></tr></table>
<p style="margin:24px 0"><a href="${e(args.url)}" style="background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;font-weight:600">${e(args.buttonLabel)}</a></p>
<p style="font-size:12px;color:#64748b">${e(args.footer)}</p>
</div>`;
}
