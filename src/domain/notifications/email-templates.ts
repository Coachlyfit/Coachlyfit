/** Plain-HTML email bodies for each notification kind — no react-email
 * dependency, just template strings, since this is three short bilingual
 * emails, not a component library. Mirrors the same three kinds and the
 * same copy the in-app bell already shows (notification-bell.tsx's KINDS +
 * messages/*.json's notifications.* strings), so an email and its bell
 * entry never disagree about what happened. */

export type NotificationKind = "exercise_promoted" | "food_promoted" | "new_message";

export type EmailLocale = "ar" | "en";

const COPY: Record<EmailLocale, { subjectByKind: Record<NotificationKind, string>; greeting: string; footer: string }> = {
  en: {
    subjectByKind: {
      exercise_promoted: "An exercise you added is now in the global library",
      food_promoted: "A food you added is now in the global library",
      new_message: "You have a new message",
    },
    greeting: "Hi",
    footer: "You're receiving this because you have email notifications turned on. You can turn them off in Settings.",
  },
  ar: {
    subjectByKind: {
      exercise_promoted: "تمت إضافة تمرين أضفته إلى المكتبة العامة",
      food_promoted: "تمت إضافة طعام أضفته إلى المكتبة العامة",
      new_message: "لديك رسالة جديدة",
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
    }
  }
  switch (kind) {
    case "exercise_promoted":
      return `"${name}" was added to the global Exercise Library.`;
    case "food_promoted":
      return `"${name}" was added to the global Food Library.`;
    case "new_message":
      return "You have a new message waiting.";
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
