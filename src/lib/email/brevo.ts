import "server-only";

/** Brevo transactional email over its HTTP API (plain fetch, no SDK). Used by
 * the admin email campaigns; the notifications cron and invoice emails still
 * send through Resend. */

const ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export type BrevoConfig = { apiKey: string; sender: { email: string; name: string } };
export type BrevoMessage = { to: string; subject: string; html: string };

/** Null when the API key or the sender address is missing. The sender must be
 * one verified in Brevo (Senders, domains, IPs). */
export function brevoConfig(): BrevoConfig | null {
  const apiKey = process.env.BREVO_API_KEY;
  const email = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !email) return null;
  return { apiKey, sender: { email, name: process.env.BREVO_SENDER_NAME ?? "Coachly Fit" } };
}

type PostResult = { ok: true } | { ok: false; rejected: boolean; message: string };

/** `rejected` means Brevo answered with a 4xx: the request was refused and
 * nothing was sent. A network error or 5xx leaves that unknown. */
async function post(config: BrevoConfig, payload: Record<string, unknown>): Promise<PostResult> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "api-key": config.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: config.sender, ...payload }),
    });
    if (response.ok) return { ok: true };
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    return {
      ok: false,
      rejected: response.status >= 400 && response.status < 500,
      message: detail?.message ?? `Brevo responded ${response.status}`,
    };
  } catch (err) {
    return { ok: false, rejected: false, message: err instanceof Error ? err.message : "network_error" };
  }
}

/** Sends one email. Returns the error message, or null when Brevo accepted it. */
export async function sendBrevoEmail(config: BrevoConfig, message: BrevoMessage): Promise<string | null> {
  const result = await post(config, {
    to: [{ email: message.to }],
    subject: message.subject,
    htmlContent: message.html,
  });
  return result.ok ? null : result.message;
}

/** Sends several emails in one call. Each one is its own message version with
 * a single `to`, so a recipient never sees another recipient. Returns one
 * entry per message, in order: null when accepted, else the error message.
 *
 * Brevo validates a batch as a whole, so one bad address gets the entire call
 * refused. When that happens (4xx: nothing was sent) the messages are sent one
 * by one, and only the bad ones fail. After a network error or a 5xx the batch
 * may already be out, so it is reported as failed and not retried. */
export async function sendBrevoBatch(config: BrevoConfig, messages: BrevoMessage[]): Promise<(string | null)[]> {
  if (messages.length === 0) return [];
  if (messages.length === 1) return [await sendBrevoEmail(config, messages[0])];

  const result = await post(config, {
    // Brevo requires top-level defaults even when every version overrides them.
    subject: messages[0].subject,
    htmlContent: messages[0].html,
    messageVersions: messages.map((message) => ({
      to: [{ email: message.to }],
      subject: message.subject,
      htmlContent: message.html,
    })),
  });
  if (result.ok) return messages.map(() => null);
  if (!result.rejected) return messages.map(() => result.message);

  const errors: (string | null)[] = [];
  for (const message of messages) errors.push(await sendBrevoEmail(config, message));
  return errors;
}
