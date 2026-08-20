"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { routing } from "@/i18n/routing";

const LOCALE_LABEL: Record<string, string> = { ar: "العربية", en: "English" };

export function LocaleSwitcher() {
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Select
      value={locale}
      onValueChange={(next) => {
        if (typeof next === "string") {
          router.replace(pathname, { locale: next });
        }
      }}
    >
      <SelectTrigger aria-label={t("language")} className="w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {routing.locales.map((l) => (
          <SelectItem key={l} value={l}>
            {LOCALE_LABEL[l]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
