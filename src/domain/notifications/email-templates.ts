import { pickLocale } from "@/domain/locale";
import { formatDate } from "@/lib/format";

/** Plain-HTML email bodies for each notification kind — no react-email
 * dependency, just template strings, since these are short bilingual
 * emails, not a component library. Mirrors the same kinds and the same
 * copy the in-app bell shows for the ones it renders (notification-bell.tsx's
 * KINDS + messages/*.json's notifications.* strings) — coach_decision is
 * client-only and never reaches the coach-side bell (see the migration's
 * notify_on_decision trigger), so it has email/push copy only. */

export type NotificationKind =
  | "exercise_promoted"
  | "food_promoted"
  | "new_message"
  | "coach_decision"
  | "decision_outcome"
  | "coach_invite"
  | "client_left"
  | "nutrition_log_reminder"
  | "off_plan_reported"
  | "subscription_trial_ending"
  | "subscription_renewal_due"
  | "subscription_past_due"
  | "subscription_canceled"
  | "task_assigned"
  | "task_completed"
  | "support_ticket_created"
  | "support_coach_reply"
  | "support_ticket_reopened"
  | "support_admin_reply"
  | "support_status_changed";

export type EmailLocale = "ar" | "en";

// Only the promoted-content kinds carry a name_ar/name_en pair in their
// payload — everything else (new_message, and the ledger's two kinds)
// renders generic copy with no payload lookup, same "short bilingual
// email, no detail embedded" choice new_message already made.
const NAMED_KINDS = new Set<NotificationKind>(["exercise_promoted", "food_promoted"]);
export function notificationNeedsPickedName(kind: string): boolean {
  return NAMED_KINDS.has(kind as NotificationKind);
}

/** The coach's own platform-subscription notices, queued by the
 * billing-lifecycle cron (queue_subscription_notice). Account notices: they
 * are emailed even with email notifications turned off. */
export function isSubscriptionNotice(kind: string): boolean {
  return kind.startsWith("subscription_");
}

/** A team task was assigned to the recipient, or finished for the owner
 * (notify_on_task). */
function isTaskNotice(kind: string): boolean {
  return kind === "task_assigned" || kind === "task_completed";
}

/** Support ticket notices (notify_on_ticket_message / _status). These three
 * go to admins; the other two go to the ticket's coach. */
const ADMIN_SUPPORT_KINDS = new Set(["support_ticket_created", "support_coach_reply", "support_ticket_reopened"]);
function isSupportNotice(kind: string): boolean {
  return kind.startsWith("support_");
}

/** The name interpolated into the copy: the bilingual name_ar/name_en pair
 * for promoted content, the client's display name for an off-plan report,
 * the date the trial/period ends for a subscription notice, the task's
 * title for a task notice, the ticket's subject for a support notice,
 * nothing otherwise. */
export function notificationName(kind: string, payload: Record<string, unknown>, locale: EmailLocale): string | null {
  if (notificationNeedsPickedName(kind)) return pickLocale(payload, locale);
  if (kind === "off_plan_reported") return (payload.client_name as string | null) ?? null;
  if (isSubscriptionNotice(kind) && typeof payload.period_end === "string") {
    return formatDate(payload.period_end, locale);
  }
  if (isTaskNotice(kind)) return (payload.title as string | null) ?? null;
  if (isSupportNotice(kind)) return (payload.subject as string | null) ?? null;
  return null;
}

/** Where tapping a push notification lands. Only kinds with an obvious
 * destination get one; everything else opens the app root as before. */
export function notificationUrl(kind: string, payload: Record<string, unknown>, locale: EmailLocale): string {
  if (kind === "nutrition_log_reminder") return `/${locale}/c/diet`;
  if (kind === "off_plan_reported" && typeof payload.client_id === "string") {
    return `/${locale}/clients/${payload.client_id}?tab=nutrition`;
  }
  if (isSubscriptionNotice(kind)) return `/${locale}/settings/subscription`;
  if (isTaskNotice(kind)) return `/${locale}/tasks`;
  if (isSupportNotice(kind) && typeof payload.ticket_id === "string") {
    const base = ADMIN_SUPPORT_KINDS.has(kind) ? "admin/support" : "support";
    return `/${locale}/${base}/${payload.ticket_id}`;
  }
  return "/";
}

const COPY: Record<
  EmailLocale,
  { subjectByKind: Record<NotificationKind, string>; greeting: string; footer: string; accountFooter: string }
> = {
  en: {
    subjectByKind: {
      exercise_promoted: "An exercise you added is now in the global library",
      food_promoted: "A food you added is now in the global library",
      new_message: "You have a new message",
      coach_decision: "Your coach updated your plan",
      decision_outcome: "An update on a recent plan change",
      coach_invite: "A new coach invited you",
      client_left: "A client moved to another coach",
      nutrition_log_reminder: "Don't forget to log today's calories",
      off_plan_reported: "A client reported an off-plan day",
      subscription_trial_ending: "Your Coachly Fit trial is ending soon",
      subscription_renewal_due: "Your Coachly Fit subscription renews soon",
      subscription_past_due: "Your Coachly Fit payment is overdue",
      subscription_canceled: "Your Coachly Fit subscription was canceled",
      task_assigned: "A task was assigned to you",
      task_completed: "A task was completed",
      support_ticket_created: "New support ticket",
      support_coach_reply: "A coach replied on a support ticket",
      support_ticket_reopened: "A support ticket was reopened",
      support_admin_reply: "Support replied on your ticket",
      support_status_changed: "Your support ticket was updated",
    },
    greeting: "Hi",
    footer: "You're receiving this because you have email notifications turned on. You can turn them off in Settings.",
    accountFooter: "This is a notice about your Coachly Fit subscription. It is sent regardless of your notification settings.",
  },
  ar: {
    subjectByKind: {
      exercise_promoted: "تمت إضافة تمرين أضفته إلى المكتبة العامة",
      food_promoted: "تمت إضافة طعام أضفته إلى المكتبة العامة",
      new_message: "لديك رسالة جديدة",
      coach_decision: "الكوتش عدّل خطتك",
      decision_outcome: "تحديث بخصوص تعديل تم على خطتك مؤخرًا",
      coach_invite: "لديك دعوة من كوتش جديد",
      client_left: "انتقل أحد عملائك إلى كوتش آخر",
      nutrition_log_reminder: "لا تنسَ تسجيل سعرات اليوم",
      off_plan_reported: "أبلغ أحد عملائك عن يوم خارج الخطة",
      subscription_trial_ending: "فترتك التجريبية في Coachly Fit تنتهي قريبًا",
      subscription_renewal_due: "اشتراكك في Coachly Fit يتجدد قريبًا",
      subscription_past_due: "دفعة اشتراكك في Coachly Fit متأخرة",
      subscription_canceled: "تم إلغاء اشتراكك في Coachly Fit",
      task_assigned: "تم تعيين مهمة لك",
      task_completed: "تم إنجاز مهمة",
      support_ticket_created: "تذكرة دعم جديدة",
      support_coach_reply: "رد كوتش على تذكرة دعم",
      support_ticket_reopened: "تمت إعادة فتح تذكرة دعم",
      support_admin_reply: "فريق الدعم رد على تذكرتك",
      support_status_changed: "تم تحديث تذكرة الدعم الخاصة بك",
    },
    greeting: "مرحبًا",
    footer: "تصلك هذه الرسالة لأن إشعارات البريد الإلكتروني مفعّلة لديك. يمكنك إيقافها من الإعدادات.",
    accountFooter: "هذا إشعار بخصوص اشتراكك في Coachly Fit، ويُرسل بغض النظر عن إعدادات الإشعارات.",
  },
};

function bodyByKind(locale: EmailLocale, kind: NotificationKind, name: string | null): string {
  if (locale === "ar") {
    switch (kind) {
      case "exercise_promoted":
        return `تمت إضافة "${name}" إلى مكتبة التمارين العامة.`;
      case "food_promoted":
        return `تمت إضافة "${name}" إلى مكتبة الأطعمة العامة.`;
      case "new_message":
        return "لديك رسالة جديدة بانتظارك.";
      case "coach_decision":
        return "راجع كوتشك آخر تشيك إن وعدّل خطتك. افتح التطبيق لمعرفة التفاصيل.";
      case "decision_outcome":
        return "فيه تحديث على نتيجة تعديل تم على خطتك. افتح التطبيق لمعرفة التفاصيل.";
      case "coach_invite":
        return "دعاك كوتش جديد للتدرّب معه. افتح التطبيق لقبول الدعوة أو رفضها.";
      case "client_left":
        return "قبل أحد عملائك دعوة من كوتش آخر، وتم إلغاء اشتراكه معك.";
      case "nutrition_log_reminder":
        return "لم تسجّل سعراتك اليوم بعد. يستغرق الأمر أقل من دقيقة.";
      case "off_plan_reported":
        return `سجّل ${name ?? "أحد عملائك"} يومًا خارج الخطة. افتح ملفه لمعرفة التفاصيل.`;
      case "subscription_trial_ending":
        return `تنتهي فترتك التجريبية${name ? ` يوم ${name}` : " قريبًا"}. اختر باقة من صفحة الاشتراك للاستمرار بدون انقطاع.`;
      case "subscription_renewal_due":
        return `يتجدد اشتراكك${name ? ` يوم ${name}` : " قريبًا"}. جدّد قبل هذا الموعد للحفاظ على حسابك فعّالًا.`;
      case "subscription_past_due":
        return `انتهت فترة اشتراكك${name ? ` يوم ${name}` : ""} ولم نستلم دفعة التجديد. حسابك يعمل لفترة سماح قصيرة، وبعدها يتوقف.`;
      case "subscription_canceled":
        return "تم إلغاء اشتراكك وتوقفت إمكانية التعديل في حسابك. بياناتك محفوظة، ويمكنك طلب إعادة التفعيل من صفحة الاشتراك.";
      case "task_assigned":
        return `تم تعيين مهمة لك${name ? `: "${name}"` : ""}. افتح صفحة المهام لمعرفة التفاصيل.`;
      case "task_completed":
        return `أنجز أحد أعضاء فريقك مهمة${name ? `: "${name}"` : ""}.`;
      case "support_ticket_created":
        return `فتح أحد الكوتشات تذكرة دعم جديدة${name ? `: "${name}"` : ""}. افتح التطبيق للاطلاع عليها.`;
      case "support_coach_reply":
        return `رد أحد الكوتشات على تذكرة دعم${name ? `: "${name}"` : ""}. افتح التطبيق للاطلاع عليها.`;
      case "support_ticket_reopened":
        return `أعاد أحد الكوتشات فتح تذكرة دعم${name ? `: "${name}"` : ""}. افتح التطبيق للاطلاع عليها.`;
      case "support_admin_reply":
        return `رد فريق الدعم على تذكرتك${name ? `: "${name}"` : ""}. افتح التطبيق للاطلاع على الرد.`;
      case "support_status_changed":
        return `تغيّرت حالة تذكرتك${name ? `: "${name}"` : ""}. افتح التطبيق للاطلاع عليها.`;
    }
  }
  switch (kind) {
    case "exercise_promoted":
      return `"${name}" was added to the global Exercise Library.`;
    case "food_promoted":
      return `"${name}" was added to the global Food Library.`;
    case "new_message":
      return "You have a new message waiting.";
    case "coach_decision":
      return "Your coach reviewed your check-in and updated your plan. Open the app for details.";
    case "decision_outcome":
      return "There's an update on the result of a recent plan change. Open the app for details.";
    case "coach_invite":
      return "A new coach invited you to train with them. Open the app to accept or decline.";
    case "client_left":
      return "One of your clients accepted another coach's invite. Their subscription with you was canceled.";
    case "nutrition_log_reminder":
      return "You haven't logged your calories today yet. It takes less than a minute.";
    case "off_plan_reported":
      return `${name ?? "A client"} marked a day as off-plan. Open their profile for details.`;
    case "subscription_trial_ending":
      return `Your trial ends ${name ? `on ${name}` : "soon"}. Pick a plan on the Subscription page to keep going without interruption.`;
    case "subscription_renewal_due":
      return `Your subscription renews ${name ? `on ${name}` : "soon"}. Renew before then to keep your account active.`;
    case "subscription_past_due":
      return `Your subscription period ended${name ? ` on ${name}` : ""} and we haven't received the renewal payment. Your account keeps working for a short grace period, then it stops.`;
    case "subscription_canceled":
      return "Your subscription was canceled and editing in your account is paused. Your data is kept, and you can ask to reactivate from the Subscription page.";
    case "task_assigned":
      return `A task was assigned to you${name ? `: "${name}"` : ""}. Open Tasks for the details.`;
    case "task_completed":
      return `A team member completed a task${name ? `: "${name}"` : ""}.`;
    case "support_ticket_created":
      return `A coach opened a new support ticket${name ? `: "${name}"` : ""}. Open the app to read it.`;
    case "support_coach_reply":
      return `A coach replied on a support ticket${name ? `: "${name}"` : ""}. Open the app to read it.`;
    case "support_ticket_reopened":
      return `A coach reopened a support ticket${name ? `: "${name}"` : ""}. Open the app to read it.`;
    case "support_admin_reply":
      return `Support replied on your ticket${name ? `: "${name}"` : ""}. Open the app to read the reply.`;
    case "support_status_changed":
      return `The status of your ticket changed${name ? `: "${name}"` : ""}. Open the app to see it.`;
  }
}

// name and recipientName are user-written (a task title, a client's or
// coach's display name) and land in an HTML body.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** name is pulled from the notification payload's name_ar/name_en (already
 * bilingual — see the admin_promote_exercise/_food functions) for the
 * promoted-content kinds; unused for new_message. */
export function renderNotificationEmail(
  locale: EmailLocale,
  kind: NotificationKind,
  recipientName: string | null,
  name: string | null
): { subject: string; html: string } {
  const copy = COPY[locale];
  const dir = locale === "ar" ? "rtl" : "ltr";
  const greeting = recipientName ? `${copy.greeting} ${escapeHtml(recipientName)},` : `${copy.greeting},`;
  const body = bodyByKind(locale, kind, name === null ? null : escapeHtml(name));

  const html = `<!doctype html>
<html dir="${dir}" lang="${locale}">
  <body style="font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;padding:24px;margin:0;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;">
      <p style="font-size:15px;color:#0f172a;margin:0 0 12px;">${greeting}</p>
      <p style="font-size:15px;color:#0f172a;margin:0 0 20px;">${body}</p>
      <p style="font-size:12px;color:#64748b;margin:0;">${isSubscriptionNotice(kind) ? copy.accountFooter : copy.footer}</p>
    </div>
  </body>
</html>`;

  return { subject: copy.subjectByKind[kind], html };
}

/** Same subject/body-by-kind copy as the email, just without the HTML
 * shell — a push notification is title + body, nothing else. */
export function renderPushNotification(
  locale: EmailLocale,
  kind: NotificationKind,
  name: string | null
): { title: string; body: string } {
  const copy = COPY[locale];
  return { title: copy.subjectByKind[kind], body: bodyByKind(locale, kind, name) };
}
