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
  | "client_left";

export type EmailLocale = "ar" | "en";

// Only the promoted-content kinds carry a name_ar/name_en pair in their
// payload — everything else (new_message, and the ledger's two kinds)
// renders generic copy with no payload lookup, same "short bilingual
// email, no detail embedded" choice new_message already made.
const NAMED_KINDS = new Set<NotificationKind>(["exercise_promoted", "food_promoted"]);
export function notificationNeedsPickedName(kind: string): boolean {
  return NAMED_KINDS.has(kind as NotificationKind);
}

const COPY: Record<EmailLocale, { subjectByKind: Record<NotificationKind, string>; greeting: string; footer: string }> = {
  en: {
    subjectByKind: {
      exercise_promoted: "An exercise you added is now in the global library",
      food_promoted: "A food you added is now in the global library",
      new_message: "You have a new message",
      coach_decision: "Your coach updated your plan",
      decision_outcome: "An update on a recent plan change",
      coach_invite: "A new coach invited you",
      client_left: "A client moved to another coach",
    },
    greeting: "Hi",
    footer: "You're receiving this because you have email notifications turned on. You can turn them off in Settings.",
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
    },
    greeting: "مرحبًا",
    footer: "تصلك هذه الرسالة لأن إشعارات البريد الإلكتروني مفعّلة لديك. يمكنك إيقافها من الإعدادات.",
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
  }
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
  const greeting = recipientName ? `${copy.greeting} ${recipientName},` : `${copy.greeting},`;
  const body = bodyByKind(locale, kind, name);

  const html = `<!doctype html>
<html dir="${dir}" lang="${locale}">
  <body style="font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;padding:24px;margin:0;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;">
      <p style="font-size:15px;color:#0f172a;margin:0 0 12px;">${greeting}</p>
      <p style="font-size:15px;color:#0f172a;margin:0 0 20px;">${body}</p>
      <p style="font-size:12px;color:#64748b;margin:0;">${copy.footer}</p>
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
