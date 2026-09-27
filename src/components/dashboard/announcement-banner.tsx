import { Megaphone } from "lucide-react";
import { pickLocale, type AppLocale } from "@/domain/locale";

/** Admin-controlled banner (platform_settings key "announcement"), rendered
 * in the (coach) and (client) layouts when enabled. No dismiss -- it's
 * meant to stay visible for the duration the admin has it on, same
 * reasoning as ImpersonationBanner not having one. */
export function AnnouncementBanner({
  locale,
  text_ar,
  text_en,
}: {
  locale: AppLocale;
  text_ar: string;
  text_en: string;
}) {
  const text = pickLocale({ text_ar, text_en }, locale, "text");
  if (!text) return null;

  return (
    <div className="flex items-center gap-2.5 bg-primary/10 px-4 py-2 text-sm font-medium text-foreground">
      <Megaphone className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words">{text}</span>
    </div>
  );
}
