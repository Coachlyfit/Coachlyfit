"use server";

import { revalidateTag } from "next/cache";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { parseSubmitOutcome } from "@/domain/sites/review-request";
import { reviewSchema, type ReviewInput } from "@/domain/sites/review.schema";
import { brevoConfig, sendBrevoEmail } from "@/lib/email/brevo";
import { clientIp } from "@/lib/sites/client-ip";
import { SITES_TAG } from "@/lib/sites/public-site";
import { createAnonClient } from "@/lib/supabase/anon";

// Public, unauthenticated actions behind a personal link. Everything goes
// through the review RPCs (rate limited, generic errors); nothing here can
// read or write a table directly.

const TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

type Lang = "ar" | "en";
export type SubmitResult =
  | { error: "invalid_input" | "invalid_link" | "rate_limited" | "failed" }
  | { displayName: string; sharePhotos: boolean };

export async function submitReviewAction(token: string, lang: Lang, input: ReviewInput): Promise<SubmitResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!TOKEN.test(token) || !parsed.success) return { error: "invalid_input" };

  const h = await headers();
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("submit_review", {
    p_token: token,
    p_rating: parsed.data.rating,
    p_body: parsed.data.body,
    p_first_name: parsed.data.firstName,
    p_share_photos: parsed.data.sharePhotos,
    p_ip: clientIp(h.get("x-forwarded-for")) ?? undefined,
  });
  if (error) return { error: "failed" };

  const outcome = parseSubmitOutcome(data);
  if (!outcome.ok) return { error: outcome.error };

  if (outcome.sharePhotos) {
    // Best effort: the review is already saved, the email is a courtesy.
    try {
      await sendWithdrawEmail(token, lang, h);
    } catch {
      /* ignore */
    }
  }
  return { displayName: outcome.displayName, sharePhotos: outcome.sharePhotos };
}

/** Withdraw photo consent. Works with a used or expired link, and takes
 * effect at once: the database unpublishes, then cached sites are refreshed. */
export async function withdrawConsentAction(token: string): Promise<{ error: "failed" | "invalid_link" } | { withdrawn: number }> {
  if (!TOKEN.test(token)) return { error: "invalid_link" };
  const h = await headers();
  const { data, error } = await createAnonClient().rpc("withdraw_consent", {
    p_token: token,
    p_ip: clientIp(h.get("x-forwarded-for")) ?? undefined,
  });
  if (error) return { error: "failed" };
  if (typeof data !== "number" || data < 0) return { error: "invalid_link" };

  if (data > 0) revalidateTag(SITES_TAG, "max");
  return { withdrawn: data };
}

const escapeHtml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Confirmation email through Brevo (the app's email provider), with the link
 * to withdraw photo consent. Skipped when Brevo isn't configured. */
async function sendWithdrawEmail(token: string, lang: Lang, h: Headers) {
  const config = brevoConfig();
  if (!config) return;

  const { data } = await createAnonClient().rpc("review_email_target", { p_token: token });
  const target = data as { email?: string; client_name?: string; coach_name?: string } | null;
  if (!target?.email) return;

  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return;
  const proto = host.startsWith("localhost") || host.includes(".localhost") ? "http" : "https";
  const link = `${proto}://${host}/review/${token}/withdraw?lang=${lang}`;

  const t = await getTranslations({ locale: lang, namespace: "clientReview.email" });
  const coach = target.coach_name ?? "";
  const first = (target.client_name ?? "").split(" ")[0] ?? "";
  const html = `<div dir="${lang === "ar" ? "rtl" : "ltr"}" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#0f172a">
<p>${escapeHtml(t("greeting", { name: first }))}</p>
<p>${escapeHtml(t("body", { coach }))}</p>
<p>${escapeHtml(t("withdraw"))}<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
<p>${escapeHtml(t("ignore"))}</p>
</div>`;

  await sendBrevoEmail(config, { to: target.email, subject: t("subject", { coach }), html });
}
