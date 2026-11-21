"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateMessageNudgeAction } from "@/app/[locale]/(coach)/settings/actions";
import { NUDGE_DELAYS } from "@/domain/messages/message-nudge";

const OFF = "off";

/** How long a client message can go unanswered before the coach gets one
 * email about it (or never). */
export function MessageNudgeSelect({ locale, minutes }: { locale: string; minutes: number | null }) {
  const t = useTranslations("settings.messageNudge");
  const tErrors = useTranslations("programs.errors");
  const [value, setValue] = useState(minutes == null ? OFF : String(minutes));
  const [pending, startTransition] = useTransition();

  const label = (v: string) => (v === OFF ? t("off") : t("minutes", { minutes: Number(v) }));

  function onChange(next: string | null) {
    if (next === null) return;
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const result = await updateMessageNudgeAction(locale, next === OFF ? null : Number(next));
      if (result?.error) {
        setValue(previous);
        toast.error(tErrors.has(result.error) ? tErrors(result.error) : tErrors("unknown"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="message_nudge" className="text-sm font-normal">
          {t("label")}
        </Label>
        <Select value={value} onValueChange={onChange} disabled={pending}>
          <SelectTrigger id="message_nudge" className="w-36">
            <SelectValue>{(v: string) => label(v)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {[OFF, ...NUDGE_DELAYS.map(String)].map((v) => (
              <SelectItem key={v} value={v}>
                {label(v)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">{t("help")}</p>
    </div>
  );
}
