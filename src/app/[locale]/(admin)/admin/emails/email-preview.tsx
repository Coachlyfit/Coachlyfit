"use client";

import { useDeferredValue, useState } from "react";
import { useTranslations } from "next-intl";
import { Monitor, Smartphone } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import { renderCampaignEmail, type EmailDirection } from "@/domain/emails/campaign-email";

type Width = "desktop" | "mobile";

/** Renders the email with the same renderCampaignEmail() the send action
 * uses, filled with a sample coach name. The HTML goes into a fully sandboxed
 * iframe (no scripts, no same-origin access), which also keeps the app's own
 * styles out of the email. */
export function EmailPreview({
  subject,
  body,
  direction,
  appUrl,
}: {
  subject: string;
  body: string;
  direction: EmailDirection;
  appUrl: string;
}) {
  const t = useTranslations("admin.emails.preview");
  const [width, setWidth] = useState<Width>("desktop");

  const rendered = renderCampaignEmail({
    subject: subject || t("subjectPlaceholder"),
    body: body || t("bodyPlaceholder"),
    direction,
    coachName: t("sampleName"),
    appUrl,
  });
  // Typing re-creates the iframe document; deferring keeps the textarea responsive.
  const html = useDeferredValue(rendered.html);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate font-medium" dir={direction}>
          {rendered.subject}
        </p>
        <Segmented
          value={width}
          onChange={setWidth}
          label={t("width")}
          options={[
            { value: "desktop", label: t("desktop"), icon: Monitor },
            { value: "mobile", label: t("mobile"), icon: Smartphone },
          ]}
        />
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-muted/40">
        <iframe
          title={t("frameTitle")}
          sandbox=""
          srcDoc={html}
          className={cn("mx-auto block h-[560px] w-full border-0 bg-white", width === "mobile" ? "max-w-[375px]" : "max-w-[680px]")}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t("sampleNote", { name: t("sampleName") })}</p>
    </div>
  );
}
